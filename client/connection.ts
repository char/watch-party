import { decode as decodeCbor, encode as encodeCbor } from "@atcute/cbor";
import { ClientPacket, ServerPacket, ServerPacketSchema } from "../common/proto.ts";
import { UserInfo } from "./app.ts";
import {
  PeerJoined,
  PeerLeft,
  PlayheadOverride,
  PlaylistChange,
  WatchSession,
} from "./session.ts";
import { BasicSignalHandler } from "./signals.ts";

export interface Peer {
  connectionId: string;
  nickname: string;
  displayColor: string;
}

export class ReceivedPacket {
  constructor(public packet: ServerPacket) {}
}

export class SessionConnection extends BasicSignalHandler {
  #abort = new AbortController();
  get abort() {
    return this.#abort.signal;
  }

  user: Peer;
  session: WatchSession;

  constructor(
    public socket: WebSocket,
    handshakePacket: ServerPacket<"Handshake">,
  ) {
    super();

    this.user = {
      connectionId: handshakePacket.connectionId,
      nickname: handshakePacket.nickname,
      displayColor: handshakePacket.displayColor,
    };
    this.session = new WatchSession(handshakePacket.session);

    this.#abort.signal.addEventListener("abort", () => {
      this.send({ type: "LeaveSession" });
      this.socket.close();
    });
    this.session.playlist = handshakePacket.playlist;
    this.session.fire(
      PlaylistChange,
      "server",
      handshakePacket.playlist,
      handshakePacket.playlistIndex,
    );
    this.session.fire(
      PlayheadOverride,
      "server",
      Date.now(),
      handshakePacket.playhead,
      handshakePacket.paused,
    );

    this.#handlePeerListChanges();
    this.#handlePlayheadChanges();
  }
  send(packet: ClientPacket) {
    this.socket.send(encodeCbor(packet));
  }

  dispose() {
    this.#abort.abort();
  }

  #handlePeerListChanges() {
    this.on(ReceivedPacket, ({ packet }) => {
      switch (packet.type) {
        case "FullPeerList": {
          this.session.peers = packet.peers;
          break;
        }
        case "PeerAdded": {
          this.session.fire(PeerJoined, {
            connectionId: packet.connectionId,
            nickname: packet.nickname,
            displayColor: packet.displayColor,
          });
          break;
        }
        case "PeerDropped": {
          const peerIdx = this.session.peers.findIndex(
            it => it.connectionId === packet.connectionId,
          );
          if (peerIdx === -1) return;
          const peer = this.session.peers.splice(peerIdx, 1).at(0)!;
          this.session.fire(PeerLeft, peer, packet.reason);
          break;
        }
      }
    });
    this.send({ type: "RequestPeerList" });
  }

  #handlePlayheadChanges() {
    this.on(ReceivedPacket, ({ packet }) => {
      if (packet.type !== "ChangePlayhead") return;
      if (packet.from === this.user.connectionId) return;
      this.session.fire(
        PlayheadOverride,
        packet.from ?? "server",
        Date.now(),
        packet.playhead,
        packet.paused,
      );
    });

    this.session.on(PlayheadOverride, event => {
      if (event.originator !== "local") return;
      this.send({ type: "ChangePlayhead", playhead: event.playhead, paused: event.paused });
    });
  }
}

async function connectViaSocket(socket: WebSocket): Promise<SessionConnection> {
  const connected = Promise.withResolvers<void>();
  const handshake = Promise.withResolvers<ServerPacket<"Handshake">>();
  socket.addEventListener("open", () => connected.resolve());
  socket.addEventListener("error", () => connected.reject());

  let connection: SessionConnection | undefined = undefined;

  socket.addEventListener("message", event => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const packet = decodeCbor(new Uint8Array(event.data))?.pipe((data: unknown) => {
      try {
        return ServerPacketSchema.parse(data);
      } catch (err) {
        console.warn("error decoding packet:", err);
        return undefined;
      }
    });
    if (!packet) return;

    if (packet.type === "Handshake") {
      handshake.resolve(packet);
    } else if (connection) connection.fire(ReceivedPacket, packet);
  });

  await connected.promise;
  const handshakePacket = await handshake.promise;
  connection = new SessionConnection(socket, handshakePacket);
  window.addEventListener("beforeunload", () => connection.dispose());
  return connection;
}

export const connectToSession = (user: UserInfo, session: string) =>
  new WebSocket(
    new URLSearchParams().pipe(it => {
      it.set("nickname", user.nickname);
      it.set("color", user.displayColor);
      return `/api/session/${session}/connect?${it.toString()}`;
    }),
  )
    .tap(s => (s.binaryType = "arraybuffer"))
    .pipe(connectViaSocket);

export const reconnectToSession = (session: string, resumptionToken: string) =>
  new WebSocket(
    new URL(`/api/session/${session}/connect`).tap(u => {
      u.searchParams.set("resume", resumptionToken);
    }),
  )
    .tap(s => (s.binaryType = "arraybuffer"))
    .pipe(connectViaSocket);
