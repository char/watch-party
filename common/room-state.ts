import type {
  Peer,
  PlaybackState,
  PlaylistItem,
  ReadyCheckEntry,
  RoomConfig,
  RoomEvent,
  RoomSnapshot,
  SuggestedSubtitleDelay,
  TimelineEntry,
} from "./protocol.ts";

export class RoomState {
  readonly id: string;
  readonly peers = new Map<string, Peer>();
  readonly presentPeerIds = new Set<string>();
  playlist: PlaylistItem[] = [];
  currentItemId: string | undefined;
  playback: PlaybackState = { positionMs: 0, paused: true, updatedAtServerMs: 0 };
  suggestedSubtitleDelays: SuggestedSubtitleDelay[] = [];
  timeline: TimelineEntry[] = [];
  config: RoomConfig = {};

  constructor(snapshot: RoomSnapshot) {
    this.id = snapshot.id;
    this.reset(snapshot);
  }

  static empty(id: string, serverNowMs: number): RoomState {
    return new RoomState({
      id,
      peerProfiles: [],
      presentPeerIds: [],
      playlist: [],
      playback: { positionMs: 0, paused: true, updatedAtServerMs: serverNowMs },
      suggestedSubtitleDelays: [],
      timeline: [],
      config: {},
    });
  }

  reset(snapshot: RoomSnapshot): void {
    if (snapshot.id !== this.id) throw new Error("snapshot is for a different room");
    this.peers.clear();
    for (const peer of snapshot.peerProfiles) this.peers.set(peer.id, peer);
    this.presentPeerIds.clear();
    for (const peerId of snapshot.presentPeerIds) this.presentPeerIds.add(peerId);
    this.playlist = [...snapshot.playlist];
    this.currentItemId = snapshot.currentItemId;
    this.playback = snapshot.playback;
    this.suggestedSubtitleDelays = [...snapshot.suggestedSubtitleDelays];
    this.timeline = [...snapshot.timeline];
    this.config = snapshot.config;
  }

  snapshot(): RoomSnapshot {
    return {
      id: this.id,
      peerProfiles: [...this.peers.values()],
      presentPeerIds: [...this.presentPeerIds],
      playlist: [...this.playlist],
      currentItemId: this.currentItemId,
      playback: this.playback,
      suggestedSubtitleDelays: [...this.suggestedSubtitleDelays],
      timeline: [...this.timeline],
      config: this.config,
    };
  }

  get activeReadyCheck(): ReadyCheckEntry | undefined {
    const entry = this.timeline.findLast(
      (entry): entry is ReadyCheckEntry => entry.type === "ready-check",
    );
    return entry && !entry.completed ? entry : undefined;
  }

  suggestedSubtitleDelay(itemId: string, trackIndex: number): number {
    return (
      this.suggestedSubtitleDelays.find(
        delay => delay.itemId === itemId && delay.trackIndex === trackIndex,
      )?.delayMs ?? 0
    );
  }

  apply(event: RoomEvent): void {
    switch (event.type) {
      case "peer/joined":
        // delete + reinsert to keep recently-rejoined peers last
        this.peers.delete(event.peer.id);
        this.peers.set(event.peer.id, event.peer);
        this.presentPeerIds.delete(event.peer.id);
        this.presentPeerIds.add(event.peer.id);
        break;

      case "peer/left": {
        this.presentPeerIds.delete(event.peerId);
        const check = this.activeReadyCheck;
        if (check) check.votes = check.votes.filter(vote => vote.peerId !== event.peerId);
        break;
      }

      case "peer/playhead-reported":
        break;

      case "chat/message-added":
        this.timeline.push(event.message);
        break;

      case "playback/changed":
        this.playback = event.playback;
        break;

      case "playlist/item-added":
        this.playlist.push(event.item);
        this.currentItemId ??= event.item.id;
        break;

      case "playlist/item-removed": {
        this.playlist = this.playlist.filter(item => item.id !== event.itemId);
        if (this.currentItemId === event.itemId) this.currentItemId = this.playlist[0]?.id;
        this.suggestedSubtitleDelays = this.suggestedSubtitleDelays.filter(
          delay => delay.itemId !== event.itemId,
        );
        break;
      }

      case "playlist/item-edited": {
        const item = this.playlist.find(item => item.id === event.itemId);
        if (item) Object.assign(item, event.patch);
        if (event.patch.subtitles)
          this.suggestedSubtitleDelays = this.suggestedSubtitleDelays.filter(
            delay => delay.itemId !== event.itemId,
          );
        break;
      }

      case "playlist/selected":
        this.currentItemId = event.itemId;
        break;

      case "ready-check/started":
        this.timeline.push(event.entry);
        break;

      case "ready-check/voted": {
        const entry = this.#readyCheckEntry(event.checkId);
        const vote = entry?.votes.find(vote => vote.peerId === event.peerId);
        if (vote) vote.vote = event.vote;
        break;
      }

      case "ready-check/completed": {
        const entry = this.#readyCheckEntry(event.checkId);
        if (entry) entry.completed = true;
        break;
      }

      case "room/config-updated":
        this.config = event.config;
        break;

      case "subtitle-delay/changed":
        this.suggestedSubtitleDelays = this.suggestedSubtitleDelays.filter(
          delay => delay.itemId !== event.itemId || delay.trackIndex !== event.trackIndex,
        );
        this.suggestedSubtitleDelays.push({
          itemId: event.itemId,
          trackIndex: event.trackIndex,
          delayMs: event.delayMs,
        });
        break;
    }
  }

  #readyCheckEntry(checkId: string): ReadyCheckEntry | undefined {
    return this.timeline.find(
      (entry): entry is ReadyCheckEntry => entry.type === "ready-check" && entry.id === checkId,
    );
  }
}
