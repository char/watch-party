import { Signal } from "@char/aftercare";
import { PlaylistItem } from "../../common/playlist.ts";
import { ServerPacket } from "../../common/proto.ts";
import { BasicSignalHandler } from "../signals.ts";
import { Peer } from "./connection.ts";

export type Originator = "local" | "server" | Peer | undefined;

export class PlaylistChange {
  constructor(
    public originator: Originator,
    public playlist: PlaylistItem[],
    public playlistIndex: number,
  ) {}
}

export class MoveInPlaylist {
  constructor(
    public originator: Originator,
    public playlistIndex: number,
  ) {}
}

export class PlayheadOverride {
  constructor(
    public originator: Originator,
    public timestamp: number,
    public playhead: number,
    public paused: boolean,
  ) {}
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

export class IncomingChatMessage {
  constructor(
    public peer: Peer,
    public text: string,
    public facets: ServerPacket<"ChatMessage">["facets"],
  ) {}
}

export class WatchSession extends BasicSignalHandler {
  peers = new Map<string, Peer>();

  playedAt: number | undefined;
  lastPlayhead: number = 0;

  playlist: PlaylistItem[] = [];
  playlistIndex: number = -1;

  get paused(): boolean {
    return this.playedAt === undefined;
  }

  get playhead(): number {
    if (this.playedAt) {
      return this.lastPlayhead + (Date.now() - this.playedAt);
    }
    return this.lastPlayhead;
  }

  currentVideo = new Signal<PlaylistItem | undefined>(undefined);

  constructor(public id: string) {
    super();

    this.on(PeerJoined, ({ peer }) => {
      this.peers.set(peer.connectionId, peer);
    });
    this.on(PeerLeft, ({ peer }) => {
      this.peers.delete(peer.connectionId);
    });

    this.on(PlaylistChange, ({ playlist, playlistIndex }) => {
      this.playlist = playlist;
      this.playlistIndex = playlistIndex;

      const currentVideo = this.playlist.at(this.playlistIndex);
      if (currentVideo && currentVideo !== this.currentVideo.get())
        this.currentVideo.set(currentVideo);
    });
    this.on(
      PlayheadOverride,
      ({ playhead, paused }) => {
        // TODO: timestamp delta :3
        this.playedAt = paused ? undefined : Date.now();
        this.lastPlayhead = playhead;
      },
      { priority: -1000 },
    );
    this.on(MoveInPlaylist, ({ playlistIndex }) => {
      if (playlistIndex === this.playlistIndex) return;
      this.playedAt = undefined;
      this.lastPlayhead = 0;
      this.playlistIndex = playlistIndex;

      const currentVideo = this.playlist.at(this.playlistIndex);
      if (currentVideo && currentVideo !== this.currentVideo.get())
        this.currentVideo.set(currentVideo);
    });
  }
}
