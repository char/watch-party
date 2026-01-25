import { Signal } from "@char/aftercare";
import { Peer } from "../../common/peer.ts";
import { ServerPacket } from "../../common/proto.ts";
import { app } from "../state/app.ts";
import {
  PeerJoined,
  PeerLeft,
  ReceivedPacket,
  SessionConnection,
} from "../state/connection.ts";
import {
  LostConnection,
  PlayheadOverride,
  PlaylistChange,
  Reconnected,
} from "../state/video-state.ts";
import { bindValue, formatTime, onEvent } from "../util.ts";
import { createPlaylistAppendForm } from "./append-to-playlist.tsx";

function ChatMessage(
  from: Peer,
  text: string,
  _facets: ServerPacket<"ChatMessage">["facets"],
  systemMessage?: boolean,
): Element {
  const message = <article className={systemMessage ? "system" : undefined} />;

  message.append(
    <strong
      _also={it => (it.style.color = from.displayColor)}
      dataset={{ peer: from.connectionId }}
    >
      {from.nickname}
    </strong>,
  );
  if (!systemMessage) message.append(": ");
  else message.append(" ");

  message.append(text);

  // TODO: render rich text facets i cba rn

  return message;
}

export class ChatWindow {
  messages: Element;
  window: Element;

  #lastMessage: Element | undefined;

  constructor(public session: SessionConnection) {
    this.messages = <div id="chat-messages"></div>;

    this.window = (
      <div id="chat-window">
        {this.messages}
        {this.#createSendForm()}
      </div>
    );

    this.#handleChat();
    this.#handleJoinLeave();
    this.#handlePlayheadOverride();
    this.#handleChatHistory();

    // todo: extract to handle func
    this.session.video.on(PlaylistChange, ev => {
      if (!ev.originator || ev.originator === "local" || ev.originator === "server") return;
      this.append(ChatMessage(ev.originator, "updated the playlist", [], true));
    });

    this.session.video.on(Reconnected, () => {
      this.append(<article className="system">Reconnected after losing connection.</article>);
    });

    this.session.video.on(LostConnection, () => {
      this.append(
        <article className="system danger">
          <strong>You lost connection.</strong> Please refresh the page.
        </article>,
      );
    });

    if (this.session.roomConfig.autoLock) {
      this.append(
        <article class="system">
          video controls were <strong>automatically locked.</strong>
          <br />
          you may unlock them via the chat command <strong>/lock</strong>.
        </article>,
      );
    }
  }

  append(message: Element) {
    const scrolledToBottom =
      this.messages.scrollTop + 16 >= this.messages.scrollHeight - this.messages.clientHeight;
    this.messages.append(message);
    if (scrolledToBottom)
      this.messages.scrollTop = this.messages.scrollHeight - this.messages.clientHeight;
    this.#lastMessage = message;
  }

  executeCommand(command: string) {
    const args = command.split(/\s+/);
    switch (args[0].toLowerCase()) {
      case "sync": {
        app.session.get().send({ type: "RequestPlayheadSync" });
        break;
      }
      case "list": {
        const list = <ul />;
        for (const peer of this.session.peers.values()) {
          list.append(
            <li>
              <strong
                _also={it => (it.style.color = peer.displayColor)}
                dataset={{ peer: peer.connectionId }}
              >
                {peer.nickname}
              </strong>
            </li>,
          );
        }
        this.append(
          <article>
            <p>connected users:</p>
            {list}
          </article>,
        );
        break;
      }
      case "lock": {
        app.locked.set(!app.locked.get());
        this.append(
          <article className="system">
            playback controls are{" "}
            {app.locked.get() ? <strong>now</strong> : <strong>no longer</strong>} locked.
          </article>,
        );
        break;
      }
      case "subdelay": {
        const milliseconds = parseFloat(args[1]);
        if (Number.isNaN(milliseconds)) return;

        // TODO: store the video element in the videostate
        const video = document.querySelector("video")!;
        for (const track of Array.from(video.textTracks)) {
          if (track.mode !== "showing") continue;
          if (!track.cues) continue;
          for (const cue of Array.from(track.cues)) {
            cue.startTime += milliseconds / 1000;
            cue.endTime += milliseconds / 1000;
            cue.dispatchEvent(new Event("exit"));
          }
          // idk
          track.mode = "disabled";
          track.mode = "showing";
        }

        this.append(
          <article className="system">
            tweaked subtitle delay by <strong>{milliseconds.toFixed(0)}ms</strong>.
          </article>,
        );

        break;
      }
      case "playlist": {
        const dialog = app.management.tryGet()?.elem;
        if (dialog) dialog.showModal();
        break;
      }
      case "append": {
        const appendDialog = createPlaylistAppendForm(this.session);
        document.querySelector("main")!.append(appendDialog);
        break;
      }
      case "help": {
        this.append(
          <article>
            <p>commands:</p>
            <ul>
              <li>
                <kbd>/sync</kbd> - resyncs video state with the server's view
              </li>
              <li>
                <kbd>/list</kbd> - lists all peers in the room
              </li>
              <li>
                <kbd>/lock</kbd> - locks video controls (forces resync on video events)
              </li>
              <li>
                <kbd>/subdelay [ms]</kbd> - bump subtitle delay (positive = later)
              </li>
            </ul>
          </article>,
        );
        break;
      }
    }
  }

  #handleChat() {
    this.session.on(ReceivedPacket, ({ packet }) => {
      if (packet.type !== "ChatMessage") return;
      const peer = this.session.peers.get(packet.from);
      if (!peer) return;
      this.append(ChatMessage(peer, packet.text, packet.facets));
    });
  }

  #handleJoinLeave() {
    this.session.on(PeerJoined, ({ peer }) =>
      ChatMessage(peer, "joined", [], true)
        .$tap(it => it.classList.add("peer", "join"))
        .$pipe(e => this.append(e)),
    );
    this.session.on(PeerLeft, ({ peer }) =>
      ChatMessage(peer, "left", [], true)
        .$tap(it => it.classList.add("peer", "leave"))
        .$pipe(e => this.append(e)),
    );
  }

  #handlePlayheadOverride() {
    this.session.video.on(PlayheadOverride, event => {
      if (event.originator === "server") {
        const msg = (
          <article className="system playhead" dataset={{ fromServer: "" }}>
            you have been synced to {formatTime(event.playhead)}.
          </article>
        );

        if (
          this.#lastMessage?.classList.contains("playhead") &&
          (this.#lastMessage as HTMLElement).dataset.fromServer !== undefined
        ) {
          this.#lastMessage.insertAdjacentElement("beforebegin", msg);
          this.#lastMessage.remove();
          this.#lastMessage = msg;
        } else {
          this.append(msg);
        }
        return;
      }
      if (event.originator === "local" && app.locked.get()) return;

      const from = event.originator === "local" ? app.session.get().user : event.originator;
      if (!from) return;

      const playState = event.paused ? "paused" : "started playing";

      const msg = ChatMessage(
        from,
        `${playState} at ${formatTime(event.playhead)}`,
        [],
        true,
      ).$tap(it => it.classList.add("playhead"));

      if (
        this.#lastMessage !== undefined &&
        this.#lastMessage.classList.contains("system") &&
        this.#lastMessage.classList.contains("playhead") &&
        this.#lastMessage.querySelector(`strong[data-peer="${from.connectionId}"]`)
      ) {
        this.#lastMessage.insertAdjacentElement("beforebegin", msg);
        this.#lastMessage.remove();
        this.#lastMessage = msg;
      } else {
        this.append(msg);
      }
    });
  }

  #handleChatHistory() {
    this.session.on(ReceivedPacket, ({ packet }) => {
      if (packet.type !== "ChatHistory") return;

      this.messages.querySelector("#history")?.remove();
      const history = <div id="history" />;
      for (const message of packet.messages) {
        history.append(ChatMessage(message.from, message.text, message.facets, message.system));
      }

      const scrolledToBottom =
        this.messages.scrollTop + 16 >= this.messages.scrollHeight - this.messages.clientHeight;
      this.messages.prepend(history);
      if (scrolledToBottom)
        this.messages.scrollTop = this.messages.scrollHeight - this.messages.clientHeight;
    });
  }

  #createSendForm() {
    // TODO: emoji completion and formatting and shit

    const messageToSend = new Signal("");
    return (
      <form
        id="chat-form"
        _also={onEvent("submit", e => {
          e.preventDefault();
          const message = messageToSend.get();
          if (!message.trim()) return;

          if (message.startsWith("/")) {
            this.executeCommand(message.substring(1));
          } else {
            this.session.send({ type: "ChatMessage", text: message, facets: [] });
            this.messages.scrollTop = this.messages.scrollHeight - this.messages.clientHeight;
          }
          messageToSend.set("");
        })}
      >
        <input
          _also={bindValue(messageToSend)}
          type="text"
          placeholder="message (or /help for commands)"
        />
      </form>
    );
  }
}
