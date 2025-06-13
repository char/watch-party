import { decode as decodeCbor, encode as encodeCbor } from "@atcute/cbor";
import { Peer } from "../common/peer.ts";
import { ServerPacket, validateClientPacket } from "../common/proto.ts";
import { WatchSession } from "./session.ts";
// @ts-types="@char/aftercare"
import { safely } from "@char/aftercare";

export interface SessionConnection {
  id: string;
  resumptionToken: string;
  peer: Peer;
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
      nickname: connection.peer.nickname,
      displayColor: connection.peer.displayColor,
      connectionId: connection.id,
      resumptionToken: connection.resumptionToken,
      playlist: session.playlist,
      playlistIndex: session.playlistIndex,
      paused: session.paused,
      playhead: session.playhead(now),
      playheadTimestamp: now.epochMilliseconds,
    });

    send({
      type: "ChatHistory",
      messages: session.chatHistory,
    });
  };
  const onMessage = (frame: Uint8Array) => {
    const packet = frame
      .pipe(it => safely(decodeCbor)(it)[0] as object)
      ?.pipe(validateClientPacket)
      ?.pipe(it => it.value);
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
        const peers = session.connections.map(c => c.peer);
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

      case "RequestPlayheadSync": {
        send({
          type: "ChangePlayhead",
          playhead: session.playhead(Temporal.Now.instant()),
          paused: session.paused,
        });
        break;
      }

      case "ChatMessage": {
        session.chatHistory.push({
          from: connection.peer,
          text: packet.text,
          facets: packet.facets,
          system: false,
        });
        session.broadcast({ ...packet, type: "ChatMessage", from: connection.id });
        break;
      }

      case "ReportPlayhead": {
        session.broadcast({ ...packet, type: "ReportPlayhead", from: connection.id });
        break;
      }

      case "AppendToPlaylist": {
        packet.item.fromPeer = connection.peer;
        session.playlist.push(packet.item);
        session.broadcast({
          type: "PlaylistUpdate",
          from: connection.id,
          playlist: session.playlist,
          playlistIndex: session.playlistIndex,
        });
        break;
      }

      case "RemoveFromPlaylist": {
        const item = session.playlist.at(packet.playlistIndex);
        if (!item || item.video !== packet.url) return;
        session.playlist.splice(packet.playlistIndex, 1);
        session.broadcast({
          type: "PlaylistUpdate",
          from: connection.id,
          playlist: session.playlist,
          playlistIndex: session.playlistIndex,
        });

        break;
      }

      case "ChangePlaylistIndex": {
        session.playlistIndex = packet.playlistIndex;
        session.broadcast({
          type: "PlaylistUpdate",
          from: connection.id,
          playlist: session.playlist,
          playlistIndex: session.playlistIndex,
        });
        break;
      }

      case "EditPlaylistItem": {
        const item = session.playlist.at(packet.playlistIndex);
        if (!item || item.video !== packet.item.video) return;
        item.mirrors = packet.item.mirrors;
        item.subtitles = packet.item.subtitles;
        session.broadcast({
          type: "PlaylistUpdate",
          from: connection.id,
          playlist: session.playlist,
          playlistIndex: session.playlistIndex,
        });

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
