import type { PlaybackState, ReadyCheckEntry, RoomState, SystemMessage } from "./protocol.ts";

export type * from "./protocol.ts";

export function playheadAt(playback: PlaybackState, serverNowMs: number): number {
  if (playback.paused) return playback.positionMs;
  return playback.positionMs + serverNowMs - playback.updatedAtServerMs;
}

export function activeReadyCheck(room: RoomState): ReadyCheckEntry | undefined {
  const entry = room.timeline.findLast(
    (entry): entry is ReadyCheckEntry => entry.type === "ready-check",
  );
  return entry && !entry.completed ? entry : undefined;
}

export function suggestedSubtitleDelay(
  room: RoomState,
  itemId: string,
  trackIndex: number,
): number {
  return (
    room.suggestedSubtitleDelays.find(
      delay => delay.itemId === itemId && delay.trackIndex === trackIndex,
    )?.delayMs ?? 0
  );
}

export function emptyRoomState(id: string, serverNowMs: number): RoomState {
  return {
    id,
    peerProfiles: [],
    presentPeerIds: [],
    playlist: [],
    suggestedSubtitleDelays: [],
    playback: {
      positionMs: 0,
      updatedAtServerMs: serverNowMs,
      paused: true,
    },
    timeline: [],
    config: {},
  };
}

export function systemMessage(id: string, text: string, peerId?: string): SystemMessage {
  return {
    type: "system-message",
    id,
    peerId,
    text,
    timestamp: Date.now(),
  };
}
