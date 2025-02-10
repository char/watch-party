import { Signal } from "@char/aftercare";
import { ClientPacket, ServerPacket } from "../../common/proto.ts";
import { app } from "../state/app.ts";
import { Peer } from "../state/connection.ts";
import {
  IncomingChatMessage,
  PeerJoined,
  PeerLeft,
  PlayheadOverride,
  WatchSession,
} from "../state/session.ts";
import { bindValue, onEvent } from "../util.ts";

function ChatMessage(
  from: Peer,
  text: string,
  _facets: ServerPacket<"ChatMessage">["facets"],
  systemMessage?: boolean,
): Element {
  const message = <article className={systemMessage ? "system" : undefined} />;

  message.append(
    <strong
      _tap={it => (it.style.color = from.displayColor)}
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

function formatTime(ms: number): string {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (60 * 1000)) % 60);
  const hours = Math.floor((ms / (3600 * 1000)) % 3600);
  return `${hours < 10 ? "0" + hours : hours}:${
    minutes < 10 ? "0" + minutes : minutes
  }:${seconds < 10 ? "0" + seconds : seconds}`;
}

export class ChatWindow {
  messages: Element;
  window: Element;

  constructor(
    public session: WatchSession,
    private sendChatMessage: (packet: Omit<ClientPacket<"ChatMessage">, "type">) => void,
  ) {
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
  }

  append(message: Element) {
    const scrolledToBottom =
      this.messages.scrollTop === this.messages.scrollHeight - this.messages.clientHeight;
    this.messages.append(message);
    if (scrolledToBottom)
      this.messages.scrollTop = this.messages.scrollHeight - this.messages.clientHeight;
  }

  executeCommand(command: string) {
    const args = command.split(/\s+/);
    switch (args[0].toLowerCase()) {
      case "sync": {
        app.connection.get()!.send({ type: "RequestPlayheadSync" });
        break;
      }
      case "list": {
        const list = <ul />;
        for (const peer of this.session.peers.values()) {
          list.append(
            <li>
              <strong
                _tap={it => (it.style.color = peer.displayColor)}
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
            </ul>
          </article>,
        );
        break;
      }
    }
  }

  #handleChat() {
    this.session.on(IncomingChatMessage, ({ peer, text, facets }) =>
      this.append(ChatMessage(peer, text, facets)),
    );
  }

  #handleJoinLeave() {
    this.session.on(PeerJoined, ({ peer }) => {
      this.append(ChatMessage(peer, "joined", [], true));
    });
    this.session.on(PeerLeft, ({ peer }) => {
      this.append(ChatMessage(peer, "left", [], true));
    });
  }

  #handlePlayheadOverride() {
    this.session.on(PlayheadOverride, event => {
      if (event.originator === "server") {
        this.append(
          <article className="system">
            you have been synced to {formatTime(event.playhead)}.
          </article>,
        );
        return;
      }
      if (event.originator === "local" && app.locked.get()) return;

      const from = event.originator === "local" ? app.connection.get()!.user : event.originator;
      if (!from) return;

      const playState = event.paused ? "paused" : "started playing";

      this.append(ChatMessage(from, `${playState} at ${formatTime(event.playhead)}`, [], true));
    });
  }

  #createSendForm() {
    // TODO: emoji completion and formatting and shit

    const messageToSend = new Signal("");
    return (
      <form
        id="chat-form"
        _tap={onEvent("submit", e => {
          e.preventDefault();
          const message = messageToSend.get();
          if (!message.trim()) return;

          if (message.startsWith("/")) {
            this.executeCommand(message.substring(1));
          } else {
            this.sendChatMessage({ text: message, facets: [] });
          }
          messageToSend.set("");
        })}
      >
        <input
          _tap={bindValue(messageToSend)}
          type="text"
          placeholder="message (or /help for commands)"
        />
      </form>
    );
  }
}
