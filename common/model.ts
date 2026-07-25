import type { PlaybackState, SystemMessage } from "./protocol.ts";

export type * from "./protocol.ts";
export { RoomState } from "./room-state.ts";

export function playheadAt(playback: PlaybackState, serverNowMs: number): number {
  if (playback.paused) return playback.positionMs;
  return playback.positionMs + serverNowMs - playback.updatedAtServerMs;
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
