import { Signal } from "@char/aftercare";
import { randomId } from "../../common/id.ts";
import {
  playheadAt,
  systemMessage,
  type Message,
  type Peer,
  type SystemMessage,
  type TimelineEntry,
} from "../../common/model.ts";
import { formatTime } from "../lib/format.ts";
import type { LocalPrefs } from "../prefs.ts";
import type { Session } from "../session.ts";
import { playReadyCheckAudio, renderReadyCheck, type ReadyCheckRender } from "./ReadyCheck.tsx";

export function Chat(opts: {
  session: Session;
  prefs: LocalPrefs;
  openPlaylist(): void;
  openPeers(): void;
  activeSubtitleTrackIndex(): number | undefined;
  setSubtitleDelay(delayMs: number): void;
}) {
  const messages = <div id="chat-messages" />;
  const input = new Signal("");
  let localMessages: SystemMessage[] = [];
  let activeReadyCheck: ReadyCheckRender | undefined;
  const readyCheckAudio = {
    started: new Audio("/assets/readycheck-started.flac"),
    yes: new Audio("/assets/readycheck-yes.flac"),
    no: new Audio("/assets/readycheck-no.flac"),
  };
  readyCheckAudio.started.load();

  const entries = () =>
    [...opts.session.room.timeline, ...localMessages].sort(
      (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
    );

  const changeMessages = (change: () => void) => {
    const wasBottom = messages.scrollTop + 16 >= messages.scrollHeight - messages.clientHeight;
    change();
    if (wasBottom) messages.scrollTop = messages.scrollHeight - messages.clientHeight;
  };

  const renderEntry = (entry: TimelineEntry): HTMLElement => {
    if (entry.type !== "ready-check") return renderMessage(entry, opts.session.room.peers);

    if (!entry.completed) activeReadyCheck?.dispose();
    const rendered = renderReadyCheck(
      opts.session,
      opts.session.room.peers,
      entry,
      () => (activeReadyCheck = undefined),
    );
    if (!entry.completed) activeReadyCheck = rendered;
    return rendered.elem;
  };

  const rebuild = () =>
    changeMessages(() => {
      activeReadyCheck?.dispose();
      activeReadyCheck = undefined;
      messages.replaceChildren(...entries().map(renderEntry));
    });

  const appendEntry = (entry: TimelineEntry) =>
    changeMessages(() => messages.append(renderEntry(entry)));

  const addLocalMessage = (text: string, peerId?: string) => {
    const message = {
      ...systemMessage(randomId(12), text, peerId),
      timestamp: opts.session.serverNow(),
    };
    localMessages = [...localMessages, message];
    appendEntry(message);
  };

  let wasDisconnected = false;
  opts.session.status.subscribe(status => {
    if (status === "reconnecting") {
      if (!wasDisconnected) addLocalMessage("Lost connection. Reconnecting…");
      wasDisconnected = true;
    }
    if (status === "connected" && wasDisconnected) {
      rebuild();
      addLocalMessage("Reconnected after losing connection.");
      wasDisconnected = false;
    }
    if (status === "closed") activeReadyCheck?.dispose();
  });

  opts.session.onEvent(event => {
    if (event.type === "chat/message-added") appendEntry(event.message);
    if (event.type === "ready-check/started") {
      appendEntry(event.entry);
      playReadyCheckAudio(readyCheckAudio.started);
    }
    if (event.type === "playback/changed" && event.by)
      addLocalMessage(
        `${event.playback.paused ? "paused" : "started playing"} at ${formatTime(event.playback.positionMs)}`,
        event.by,
      );
    if (
      event.type === "playlist/item-added" ||
      event.type === "playlist/item-removed" ||
      event.type === "playlist/item-edited"
    )
      addLocalMessage("updated the playlist", event.by);
    if (event.type === "playlist/selected")
      addLocalMessage("switched playlist entry", event.by);
    if (event.type === "subtitle-delay/changed")
      addLocalMessage(
        `set the global subtitle delay to ${event.delayMs.toFixed(0)}ms.`,
        event.by,
      );
    if (event.type === "ready-check/voted" && event.peerId === opts.session.self.id)
      playReadyCheckAudio(event.vote === "yes" ? readyCheckAudio.yes : readyCheckAudio.no);
  });

  rebuild();

  const chatWindow = (
    <div id="chat-window">
      {messages}
      <form
        id="chat-form"
        _onsubmit={(event: SubmitEvent) => {
          event.preventDefault();
          const text = input.get();
          if (!text.trim()) return;
          if (text.startsWith("/"))
            executeCommand(text.slice(1), {
              ...opts,
              localMessage: addLocalMessage,
            });
          else
            opts.session.send({
              type: "chat/send",
              text,
              facets: [],
            });
          input.set("");
        }}
      >
        <input value={input} type="text" placeholder="message (or /help)" />
      </form>
    </div>
  ) as HTMLElement;

  return chatWindow;
}

function renderMessage(message: Message, peers: ReadonlyMap<string, Peer>) {
  const peerId = message.type === "chat" ? message.from : message.peerId;
  const peer = peerId ? peers.get(peerId) : undefined;
  const article = <article class={message.type === "system-message" ? "system" : undefined} />;

  if (peer) {
    article.append(
      <strong
        style={{ color: peer.displayColor }}
        dataset={{ peer: peer.id }}
        title={new Date(message.timestamp).toLocaleString()}
      >
        {peer.nickname}
      </strong>,
    );
    article.append(message.type === "system-message" ? " " : ": ");
  }

  article.append(message.text);
  return article as HTMLElement;
}

function executeCommand(
  command: string,
  opts: {
    session: Session;
    prefs: LocalPrefs;
    openPlaylist(): void;
    openPeers(): void;
    activeSubtitleTrackIndex(): number | undefined;
    setSubtitleDelay(delayMs: number): void;
    localMessage(text: string): void;
  },
) {
  const [name = "", ...args] = command.split(/\s+/);
  switch (name.toLowerCase()) {
    case "sync":
      opts.session.send({
        type: "playback/request-sync",
      });
      opts.localMessage(
        `re-synced playback to ${formatTime(
          playheadAt(opts.session.room.playback, opts.session.serverNow()),
        )}.`,
      );
      break;

    case "lock":
      opts.prefs.controlsLocked.set(!opts.prefs.controlsLocked.get());
      opts.localMessage(
        `playback controls are ${opts.prefs.controlsLocked.get() ? "now" : "no longer"} locked.`,
      );
      break;

    case "subdelay": {
      const delay = Number(args[0]);
      if (!Number.isFinite(delay)) {
        opts.localMessage("usage: /subdelay [ms]");
        break;
      }
      opts.setSubtitleDelay(delay);
      opts.localMessage(`set subtitle delay to ${delay.toFixed(0)}ms.`);
      break;
    }

    case "gsubdelay": {
      const delay = Number(args[0]);
      if (!Number.isFinite(delay)) {
        opts.localMessage("usage: /gsubdelay [ms]");
        break;
      }
      const token = opts.session.editToken.get();
      if (!token) {
        opts.localMessage("no edit token for this room.");
        break;
      }
      const itemId = opts.session.room.currentItemId;
      const trackIndex = opts.activeSubtitleTrackIndex();
      if (!itemId || trackIndex === undefined) {
        opts.localMessage("no subtitle track is currently active.");
        break;
      }
      opts.session.send({
        type: "subtitle-delay/set",
        editToken: token,
        itemId,
        trackIndex,
        delayMs: delay,
      });
      break;
    }

    case "playlist":
      opts.openPlaylist();
      break;

    case "peers":
    case "list":
      opts.openPeers();
      break;

    case "readycheck":
    case "rc": {
      const vote =
        args[0] === "yes" || args[0] === "y"
          ? "yes"
          : args[0] === "no" || args[0] === "n"
            ? "no"
            : undefined;
      const check = opts.session.room.activeReadyCheck;
      if (!args[0]) {
        opts.session.send({
          type: "ready-check/start",
        });
      } else if (vote && check) {
        opts.session.send({
          type: "ready-check/vote",
          checkId: check.id,
          vote,
        });
      } else {
        opts.localMessage("usage: /rc, /rc yes, or /rc no");
      }
      break;
    }

    case "edit-auth": {
      const token = args[0];
      if (!token) {
        const current = opts.session.editToken.get();
        opts.localMessage(
          current ? `edit token: ${current}` : "no edit token set. usage: /edit-auth [token]",
        );
        break;
      }
      opts.session.editToken.set(token);
      opts.localMessage("edit token set.");
      break;
    }

    case "autolock": {
      const token = opts.session.editToken.get();
      if (!token) {
        opts.localMessage("no edit token for this room.");
        break;
      }
      const autoLock = !opts.session.room.config.autoLock;
      opts.session.send({
        type: "room/update-config",
        editToken: token,
        config: {
          ...opts.session.room.config,
          autoLock,
        },
      });
      opts.localMessage(`auto-lock is ${autoLock ? "now" : "no longer"} enabled.`);
      break;
    }

    case "help":
    default:
      opts.localMessage(
        "commands: /sync, /lock, /subdelay [ms], /gsubdelay [ms], /playlist, /peers (or /list), /rc, /rc yes|no, /edit-auth [token], /autolock",
      );
      break;
  }
}
