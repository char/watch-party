import { decode as decodeCbor, encode as encodeCbor } from "@atcute/cbor";
import { ClientPacket, ClientPacketSchema, ServerPacket } from "../common/proto.ts";
import { WatchSession } from "./sessions.ts";

export interface SessionConnection {
  id: string;
  resumptionToken: string;
  nickname: string;
  displayColor: string; // css color
  sockets: Set<WebSocket>;
  lastKeepalive: number; // Date.now
}

export function handleConnection(
  session: WatchSession,
  connection: SessionConnection,
  socket: WebSocket,
) {
  socket.binaryType = "arraybuffer";
  connection.sockets.add(socket);

  const send = (packet: ServerPacket) => {
    socket.send(encodeCbor(packet));
  };

  const onReady = () => {
    const now = Temporal.Now.instant();

    send({
      type: "Handshake",
      session: session.id,
      nickname: connection.nickname,
      displayColor: connection.displayColor,
      connectionId: connection.id,
      resumptionToken: connection.resumptionToken,
      playlist: session.playlist,
      playlistIndex: session.playlistIndex,
      paused: session.paused,
      playhead: session.playhead(now),
      playheadTimestamp: now.epochMilliseconds,
    });
  };
  const onMessage = (frame: Uint8Array) => {
    const packet: ClientPacket | undefined = frame
      .pipe(decodeCbor)
      ?.pipe((data: unknown) => ClientPacketSchema.parse(data));
    if (!packet) return;

    connection.lastKeepalive = Date.now();

    switch (packet.type) {
      case "LeaveSession": {
        if (connection.sockets.size === 1) {
          session.dropPeer(connection, "disconnect");
        }
        break;
      }

      case "RequestPeerList": {
        const peers = session.connections.map(c => ({
          connectionId: c.id,
          displayColor: c.displayColor,
          nickname: c.nickname,
        }));
        send({ type: "FullPeerList", peers });
        break;
      }

      case "ChangePlayhead": {
        session.lastPlayhead = packet.playhead;
        if (packet.paused) session.playedAt = undefined;
        else session.playedAt = Temporal.Now.instant();

        session.broadcast({ ...packet, type: "ChangePlayhead", from: connection.id });
        break;
      }

      case "ChatMessage": {
        session.broadcast({ ...packet, type: "ChatMessage", from: connection.id });
        break;
      }
    }
  };

  if (socket.readyState === WebSocket.OPEN) onReady();
  else socket.addEventListener("open", onReady);

  socket.addEventListener("message", event => {
    if (event.data instanceof ArrayBuffer) {
      onMessage(new Uint8Array(event.data));
    }
  });

  socket.addEventListener("close", () => {
    connection.sockets.delete(socket);
  });

  socket.addEventListener("error", () => {
    connection.sockets.delete(socket);
    session.checkPeerTimeout(connection);
  });
}
