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
import { formatTime, onEvent } from "../util.ts";
import { createPlaylistAppendForm } from "./append-to-playlist.tsx";
import {
  createReadyCheckAudio,
  playReadyCheckSound,
  preloadVoteSounds,
  ReadyCheckEmbed,
} from "./readycheck.tsx";

function ChatMessage(
  from: Peer,
  text: string,
  _facets: ServerPacket<"ChatMessage">["facets"],
  systemMessage?: boolean,
  timestamp?: number,
): Element {
  const message = <article class={systemMessage ? "system" : undefined} />;

  // TODO: better timestamp humanization

  message.append(
    <strong
      style={{ color: from.displayColor }}
      dataset={{ peer: from.connectionId }}
      title={timestamp !== undefined ? new Date(timestamp).toLocaleString() : undefined}
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

  #readyCheckAudio = createReadyCheckAudio();
  #readyChecks = new Map<string, ReadyCheckEmbed>();
  #activeReadyCheckId: string | undefined;

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
    this.#handleReadyCheck();

    // todo: extract to handle func
    this.session.video.on(PlaylistChange, ev => {
      if (!ev.originator || ev.originator === "local" || ev.originator === "server") return;
      this.append(ChatMessage(ev.originator, "updated the playlist", [], true));
    });

    this.session.video.on(Reconnected, () => {
      this.append(<article class="system">Reconnected after losing connection.</article>);
    });

    this.session.video.on(LostConnection, () => {
      this.append(
        <article class="system danger">
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
                style={{ color: peer.displayColor }}
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
          <article class="system">
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
          <article class="system">
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
      case "readycheck":
      case "rc": {
        const arg = args[1]?.toLowerCase();
        if (arg === undefined) {
          this.session.send({ type: "ReadyCheckStart" });
          break;
        }
        const vote =
          arg === "y" || arg === "yes" ? "yes" : arg === "n" || arg === "no" ? "no" : undefined;
        if (vote === undefined) {
          this.append(<article class="system">usage: /rc, /rc [y|yes], or /rc [n|no]</article>);
          break;
        }
        const active =
          this.#activeReadyCheckId && this.#readyChecks.get(this.#activeReadyCheckId);
        if (!active) {
          this.append(<article class="system">no active ready check.</article>);
          break;
        }
        active.vote(vote);
        break;
      }
      case "edit-auth": {
        const token = args[1];
        if (!token) {
          this.append(<article class="system">usage: /edit-auth [token]</article>);
          break;
        }
        app.localEditToken.set(token);
        this.append(<article class="system">edit token set.</article>);
        break;
      }
      case "toggle-autolock": {
        const token = app.localEditToken.get();
        if (!token) {
          this.append(
            <article class="system">
              no edit token set. use <strong>/edit-auth [token]</strong> first.
            </article>,
          );
          break;
        }
        const newAutoLock = !this.session.roomConfig.autoLock;
        fetch(`/api/session/${this.session.video.id}/config`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ...this.session.roomConfig, autoLock: newAutoLock }),
        }).then(async res => {
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: res.statusText }));
            this.append(<article class="system">failed to update config: {error}</article>);
          }
        });
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
              <li>
                <kbd>/readycheck</kbd> (or <kbd>/rc</kbd>) - start a 30-second ready check;{" "}
                <kbd>/rc [y|n]</kbd> to vote on an active one
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
      this.append(ChatMessage(peer, packet.text, packet.facets, false, packet.timestamp));
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
          <article class="system playhead" dataset={{ fromServer: "" }}>
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

  #handleReadyCheck() {
    this.session.on(ReceivedPacket, ({ packet }) => {
      switch (packet.type) {
        case "ReadyCheckStarted": {
          const initiator = this.session.peers.get(packet.from);
          if (!initiator) return;
          const participants = packet.participants
            .map(id => this.session.peers.get(id))
            .filter((p): p is NonNullable<typeof p> => p !== undefined);
          const selfId = this.session.user.connectionId;
          const amInitiator = packet.from === selfId;
          const voteId = packet.voteId;

          const embed = new ReadyCheckEmbed({
            voteId,
            initiator,
            participants,
            endsAt: packet.endsAt,
            selfId,
            amInitiator,
            onVote: vote => {
              this.session.send({ type: "ReadyCheckVote", voteId, vote });
              playReadyCheckSound(
                vote === "yes" ? this.#readyCheckAudio.yes : this.#readyCheckAudio.no,
              );
            },
            onEndEarly: () => {
              const token = embed.managementToken;
              if (!token) return;
              this.session.send({
                type: "ReadyCheckTerminate",
                voteId,
                managementToken: token,
              });
            },
          });

          this.#readyChecks.set(voteId, embed);
          this.#activeReadyCheckId = voteId;
          this.append(embed.elem);
          playReadyCheckSound(this.#readyCheckAudio.started);
          preloadVoteSounds(this.#readyCheckAudio);
          break;
        }
        case "ReadyCheckManagement": {
          this.#readyChecks.get(packet.voteId)?.setManagementToken(packet.managementToken);
          break;
        }
        case "ReadyCheckVote": {
          this.#readyChecks.get(packet.voteId)?.recordVote(packet.from, packet.vote);
          break;
        }
        case "ReadyCheckAbstain": {
          this.#readyChecks.get(packet.voteId)?.recordVote(packet.peer, "abstain");
          if (packet.peer === this.session.user.connectionId)
            playReadyCheckSound(this.#readyCheckAudio.no);
          break;
        }
        case "ReadyCheckComplete": {
          this.#readyChecks.get(packet.voteId)?.complete();
          this.#readyChecks.delete(packet.voteId);
          if (this.#activeReadyCheckId === packet.voteId) this.#activeReadyCheckId = undefined;
          break;
        }
      }
    });
  }

  #handleChatHistory() {
    this.session.on(ReceivedPacket, ({ packet }) => {
      if (packet.type !== "ChatHistory") return;

      this.messages.querySelector("#history")?.remove();
      const history = <div id="history" />;
      for (const message of packet.messages) {
        history.append(
          ChatMessage(
            message.from,
            message.text,
            message.facets,
            message.system,
            message.timestamp,
          ),
        );
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
          value={messageToSend}
          type="text"
          placeholder="message (or /help for commands)"
        />
      </form>
    );
  }
}
