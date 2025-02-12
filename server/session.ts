import { encode as encodeCbor } from "@atcute/cbor";

import { PlaylistItem } from "../common/playlist.ts";
import { ChatFacet, ServerPacket } from "../common/proto.ts";
import { SessionConnection } from "./connection.ts";

export class WatchSession {
  static SESSIONS = new Map<string, WatchSession>();

  connections: SessionConnection[] = [];

  chatHistory: {
    from: { nickname: string; connectionId: string; displayColor: string };
    text: string;
    facets?: ChatFacet[];
    system?: boolean;
  }[] = [];

  playlist: PlaylistItem[] = [];
  playlistIndex: number = -1;

  lastPlayhead: number = 0; // milliseconds
  playedAt: Temporal.Instant | undefined = undefined;
  playhead(now: Temporal.Instant = Temporal.Now.instant()): number {
    if (this.playedAt) {
      const delta = now.since(this.playedAt).total("milliseconds");
      return this.lastPlayhead + delta;
    }
    return this.lastPlayhead;
  }
  get paused(): boolean {
    return this.playedAt === undefined;
  }

  #dispose = new AbortController();

  constructor(public id: string) {
    WatchSession.SESSIONS.set(id, this);

    const timeoutTask = setInterval(() => {
      for (const connection of this.connections) {
        this.checkPeerTimeout(connection);
      }
    }, 1000);
    this.#dispose.signal.addEventListener("abort", () => {
      clearInterval(timeoutTask);
    });
  }

  #send(connection: SessionConnection, serializedPacket: Uint8Array) {
    for (const socket of connection.sockets) {
      try {
        socket.send(serializedPacket);
      } catch {
        connection.sockets.delete(socket);
      }
    }
  }

  info() {
    return {
      id: this.id,
      playlist: this.playlist,
      playlistIndex: this.playlistIndex,
      playhead: this.playhead(),
      paused: this.paused,
    };
  }

  checkPeerTimeout(connection: SessionConnection) {
    if (
      !connection.sockets.values().some(it => it.readyState === WebSocket.OPEN) &&
      connection.lastKeepalive < Date.now() - 15_000
    ) {
      this.dropPeer(connection, "timeout");
    }
  }

  broadcast(packet: ServerPacket) {
    const serializedPacket = encodeCbor(packet);
    for (const connection of this.connections) {
      this.#send(connection, serializedPacket);
    }
  }

  addPeer(connection: SessionConnection) {
    this.connections.push(connection);

    const peer = {
      connectionId: connection.id,
      nickname: connection.nickname,
      displayColor: connection.displayColor,
    };

    this.broadcast({
      type: "PeerAdded",
      ...peer,
    });
    this.chatHistory.push({ from: peer, text: "joined", system: true });
  }

  dropPeer(
    connection: SessionConnection,
    reason: (ServerPacket & { type: "PeerDropped" })["reason"],
  ) {
    this.connections = this.connections.filter(it => it !== connection);
    this.broadcast({ type: "PeerDropped", connectionId: connection.id, reason });
    this.chatHistory.push({
      from: {
        connectionId: connection.id,
        nickname: connection.nickname,
        displayColor: connection.displayColor,
      },
      text: "left",
      system: true,
    });
  }
}
