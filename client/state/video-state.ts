import { Signal } from "@char/aftercare";
import { PlaylistItem } from "../../common/playlist.ts";
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

export class VideoState extends BasicSignalHandler {
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

    this.on(PlaylistChange, ({ playlist, playlistIndex }) => {
      this.playlist = playlist;
      this.playlistIndex = playlistIndex;
      this.updateCurrentVideo();
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
      this.updateCurrentVideo();
    });
  }

  updateCurrentVideo() {
    const currentVideo = this.playlist.at(this.playlistIndex);
    if (currentVideo && currentVideo !== this.currentVideo.get())
      this.currentVideo.set(currentVideo);
  }
}
