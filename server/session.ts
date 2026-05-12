import { encode as encodeCbor } from "@atcute/cbor";

import { PlaylistItem } from "../common/playlist.ts";
import { ServerPacket } from "../common/proto.ts";
import { RoomConfig } from "../common/room-config.ts";
import { SessionConnection } from "./connection.ts";
import { randomBase32 } from "./util/base32.ts";

export interface ActiveReadyCheck {
  voteId: string;
  initiator: string;
  managementToken: string;
  participants: Set<string>;
  votes: Map<string, "yes" | "no">;
  endsAt: number;
  timeout: number;
}

export class WatchSession {
  static SESSIONS = new Map<string, WatchSession>();

  connections: SessionConnection[] = [];

  chatHistory: ServerPacket<"ChatHistory">["messages"] = [];

  playlist: PlaylistItem[] = [];
  playlistIndex: number = -1;

  roomConfig: RoomConfig = {};
  editToken: string = randomBase32(24);

  activeReadyCheck: ActiveReadyCheck | undefined = undefined;

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

  sendTo(connection: SessionConnection, packet: ServerPacket) {
    this.#send(connection, encodeCbor(packet));
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

    this.broadcast({
      type: "PeerAdded",
      ...connection.peer,
    });
    this.chatHistory.push({
      from: connection.peer,
      text: "joined",
      facets: [],
      system: true,
      timestamp: Date.now(),
    });
  }

  dropPeer(
    connection: SessionConnection,
    reason: (ServerPacket & { type: "PeerDropped" })["reason"],
  ) {
    this.connections = this.connections.filter(it => it !== connection);
    this.broadcast({ type: "PeerDropped", connectionId: connection.id, reason });
    this.chatHistory.push({
      from: connection.peer,
      text: "left",
      facets: [],
      system: true,
      timestamp: Date.now(),
    });

    if (this.activeReadyCheck?.participants.delete(connection.id))
      this.checkReadyCheckCompletion();
  }

  startReadyCheck(initiator: SessionConnection): boolean {
    if (this.activeReadyCheck) return false;

    const voteId = randomBase32(12);
    const managementToken = randomBase32(16);
    const duration = 30_000;
    const endsAt = Date.now() + duration;
    const participants = new Set(this.connections.map(c => c.id));

    this.activeReadyCheck = {
      voteId,
      initiator: initiator.id,
      managementToken,
      participants,
      votes: new Map(),
      endsAt,
      timeout: setTimeout(() => this.completeReadyCheck(voteId), duration),
    };

    this.broadcast({
      type: "ReadyCheckStarted",
      voteId,
      from: initiator.id,
      endsAt,
      participants: [...participants],
    });
    this.sendTo(initiator, { type: "ReadyCheckManagement", voteId, managementToken });
    return true;
  }

  recordReadyCheckVote(
    connection: SessionConnection,
    voteId: string,
    vote: "yes" | "no",
  ): void {
    const rc = this.activeReadyCheck;
    if (!rc || rc.voteId !== voteId) return;
    if (!rc.participants.has(connection.id)) return;
    if (rc.votes.has(connection.id)) return;

    rc.votes.set(connection.id, vote);
    this.broadcast({ type: "ReadyCheckVote", voteId, from: connection.id, vote });
    this.checkReadyCheckCompletion();
  }

  terminateReadyCheck(voteId: string, managementToken: string): void {
    const rc = this.activeReadyCheck;
    if (!rc || rc.voteId !== voteId) return;
    if (rc.managementToken !== managementToken) return;
    this.completeReadyCheck(voteId);
  }

  checkReadyCheckCompletion(): void {
    const rc = this.activeReadyCheck;
    if (!rc) return;
    if (rc.votes.size >= rc.participants.size) this.completeReadyCheck(rc.voteId);
  }

  completeReadyCheck(voteId: string): void {
    const rc = this.activeReadyCheck;
    if (!rc || rc.voteId !== voteId) return;
    clearTimeout(rc.timeout);
    this.activeReadyCheck = undefined;

    for (const peer of rc.participants) {
      if (rc.votes.has(peer)) continue;
      this.broadcast({ type: "ReadyCheckAbstain", voteId, peer });
    }
    this.broadcast({ type: "ReadyCheckComplete", voteId });
  }
}
