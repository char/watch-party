import { Signal } from "@char/aftercare";
import { ServerPacket } from "../common/proto.ts";
import { Peer, ReceivedPacket, SessionConnection } from "./connection.ts";
import { PeerJoined, PeerLeft, PlayheadOverride } from "./session.ts";
import { bindValue, onEvent } from "./util.ts";

function renderChatMessage(
  from: Peer,
  text: string,
  _facets: ServerPacket<"ChatMessage">["facets"],
  systemMessage?: boolean,
) {
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

export function createChat(connection: SessionConnection): Element {
  const lookupPeer = (id: string) =>
    connection.session.peers.find(it => it.connectionId === id);

  const messages = <div id="chat-messages"></div>;
  const appendChatMessage = (message: Element) => {
    const scrolledToBottom =
      messages.scrollTop === messages.scrollHeight - messages.clientHeight;
    messages.append(message);
    if (scrolledToBottom) {
      messages.scrollTop = messages.scrollHeight - messages.clientHeight;
    }
  };

  connection.on(ReceivedPacket, ({ packet }) => {
    if (packet.type === "ChatMessage") {
      const from = lookupPeer(packet.from);
      if (!from) return;

      appendChatMessage(renderChatMessage(from, packet.text, packet.facets));
    }
  });

  connection.session.on(PeerJoined, ({ peer }) => {
    appendChatMessage(renderChatMessage(peer, "joined", [], true));
  });
  connection.session.on(PeerLeft, ({ peer }) => {
    appendChatMessage(renderChatMessage(peer, "left", [], true));
  });

  connection.session.on(PlayheadOverride, event => {
    const formatTime = (ms: number) => {
      const seconds = Math.floor((ms / 1000) % 60);
      const minutes = Math.floor((ms / (60 * 1000)) % 60);
      const hours = Math.floor((ms / (3600 * 1000)) % 3600);
      return `${hours < 10 ? "0" + hours : hours}:${
        minutes < 10 ? "0" + minutes : minutes
      }:${seconds < 10 ? "0" + seconds : seconds}`;
    };

    if (event.originator === "server") return;
    const from = event.originator === "local" ? connection.user : lookupPeer(event.originator);
    if (!from) return;

    const playState = event.paused ? "paused" : "started playing";

    appendChatMessage(
      renderChatMessage(from, `${playState} at ${formatTime(event.playhead)}`, [], true),
    );
  });

  const messageToSend = new Signal("");
  const send = (
    <form
      id="chat-form"
      _tap={onEvent("submit", e => {
        e.preventDefault();
        const message = messageToSend.get();
        if (!message.trim()) return;
        connection.send({ type: "ChatMessage", text: message, facets: [] });
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

  return (
    <div id="chat-window">
      {messages}
      {send}
    </div>
  );
}
