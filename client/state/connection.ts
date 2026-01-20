import { decode as decodeCbor, encode as encodeCbor } from "@atcute/cbor";
import { LazySignal } from "../../common/lazy-signal.ts";
import { Peer } from "../../common/peer.ts";
import { ClientPacket, ServerPacket, validateServerPacket } from "../../common/proto.ts";
import { BasicSignalHandler } from "../signals.ts";
import { app, UserInfo } from "./app.ts";
import { PlayheadOverride, PlaylistChange, VideoState } from "./video-state.ts";

export interface ClientPeer extends Peer {
  playhead: LazySignal<{ time: number; paused: boolean }>;
}

export class ReceivedPacket {
  constructor(public packet: ServerPacket) {}
}

export class PeerJoined {
  constructor(public peer: Peer) {}
}
export class PeerLeft {
  constructor(
    public peer: Peer,
    public reason: ServerPacket<"PeerDropped">["reason"],
  ) {}
}

export class SessionConnection extends BasicSignalHandler {
  #abort = new AbortController();
  get abort() {
    return this.#abort.signal;
  }

  user: ClientPeer;
  peers = new Map<string, ClientPeer>();
  video: VideoState;

  resumptionToken: string;

  constructor(
    public socket: WebSocket,
    handshakePacket: ServerPacket<"Handshake">,
  ) {
    super();

    this.resumptionToken = handshakePacket.resumptionToken;

    this.user = {
      connectionId: handshakePacket.connectionId,
      nickname: handshakePacket.nickname,
      displayColor: handshakePacket.displayColor,
      playhead: new LazySignal(),
    };
    this.peers.set(this.user.connectionId, this.user);
    this.video = new VideoState(handshakePacket.session);

    this.#abort.signal.addEventListener("abort", () => {
      this.send({ type: "LeaveSession" });
      this.socket.close();
    });
    this.video.playlist = handshakePacket.playlist;
    this.video.playlistIndex = handshakePacket.playlistIndex;
    this.video.fire(
      PlaylistChange,
      "server",
      handshakePacket.playlist,
      handshakePacket.playlistIndex,
    );
    this.video.fire(
      PlayheadOverride,
      "server",
      Date.now(),
      handshakePacket.playhead,
      handshakePacket.paused,
    );

    this.#handlePeerListChanges();
    this.#handlePlayheadChanges();
    this.#handlePlayheadReports();
    this.#handlePlaylistUpdates();
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
          this.peers.clear();
          for (const peer of packet.peers)
            this.peers.set(peer.connectionId, { ...peer, playhead: new LazySignal() });
          break;
        }
        case "PeerAdded": {
          const peer = {
            connectionId: packet.connectionId,
            nickname: packet.nickname,
            displayColor: packet.displayColor,
          };
          this.peers.set(peer.connectionId, { ...peer, playhead: new LazySignal() });
          this.fire(PeerJoined, peer);
          break;
        }
        case "PeerDropped": {
          const peer = this.peers.get(packet.connectionId);
          if (!peer) return;
          this.peers.delete(peer.connectionId);
          this.fire(PeerLeft, peer, packet.reason);
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
      this.video.fire(
        PlayheadOverride,
        packet.from ? this.peers.get(packet.from) : "server",
        Date.now(),
        packet.playhead,
        packet.paused,
      );
    });

    this.video.on(PlayheadOverride, event => {
      if (event.originator !== "local") return;
      if (app.locked.get()) {
        this.send({ type: "RequestPlayheadSync" });
        return;
      }
      this.send({ type: "ChangePlayhead", playhead: event.playhead, paused: event.paused });
    });
  }

  #handlePlayheadReports() {
    this.on(ReceivedPacket, ({ packet }) => {
      if (packet.type !== "ReportPlayhead") return;
      const peer = this.peers.get(packet.from);
      if (!peer) return;
      peer.playhead.set({ time: packet.playhead, paused: packet.paused });
    });
  }

  #handlePlaylistUpdates() {
    this.on(ReceivedPacket, ({ packet }) => {
      if (packet.type !== "PlaylistUpdate") return;
      // TODO: packet.from ?
      this.video.fire(
        PlaylistChange,
        packet.from?.$pipe(it => this.peers.get(it)) ?? "server",
        packet.playlist,
        packet.playlistIndex,
      );
    });
  }
}

async function connectViaSocket(socket: WebSocket): Promise<SessionConnection> {
  const connected = Promise.withResolvers<void>();
  const handshake = Promise.withResolvers<ServerPacket<"Handshake">>();
  socket.addEventListener("open", () => connected.resolve());
  socket.addEventListener("error", () => connected.reject());

  let session: SessionConnection | undefined = undefined;

  socket.addEventListener("message", event => {
    if (!(event.data instanceof ArrayBuffer)) return;
    const packet = decodeCbor(new Uint8Array(event.data))?.$pipe((data: unknown) => {
      const { value, errors } = validateServerPacket(data);
      if (errors) {
        console.warn("error decoding packet:", errors);
      }
      return value;
    });
    if (!packet) return;

    if (packet.type === "Handshake") {
      handshake.resolve(packet);
    } else if (session) session.fire(ReceivedPacket, packet);
  });

  await connected.promise;
  const handshakePacket = await handshake.promise;
  session = new SessionConnection(socket, handshakePacket);
  window.addEventListener("beforeunload", () => session.dispose());
  return session;
}

export const connectToSession = (user: UserInfo, session: string) =>
  new WebSocket(
    new URLSearchParams().$pipe(it => {
      it.set("nickname", user.nickname);
      it.set("color", user.displayColor);
      return `/api/session/${session}/connect?${it.toString()}`;
    }),
  )
    .$tap(s => (s.binaryType = "arraybuffer"))
    .$pipe(connectViaSocket);

export const reconnectToSession = (session: string, resumptionToken: string) =>
  new WebSocket(
    new URLSearchParams().$pipe(it => {
      it.set("resume", resumptionToken);
      return `/api/session/${session}/connect?${it.toString()}`;
    }),
  )
    .$tap(s => (s.binaryType = "arraybuffer"))
    .$pipe(connectViaSocket);
