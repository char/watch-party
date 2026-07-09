import { activeReadyCheck } from "./model.ts";
import type { ReadyCheckEntry, RoomEvent, RoomState, TimelineEntry } from "./model.ts";

function updateReadyCheckEntry(
  timeline: TimelineEntry[],
  checkId: string,
  update: (entry: ReadyCheckEntry) => Partial<ReadyCheckEntry>,
): TimelineEntry[] {
  return timeline.map(entry =>
    entry.type === "ready-check" && entry.id === checkId
      ? { ...entry, ...update(entry) }
      : entry,
  );
}

export function resolveRoomState(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case "peer/joined":
      return {
        ...state,
        peerProfiles: [
          ...state.peerProfiles.filter(peer => peer.id !== event.peer.id),
          event.peer,
        ],
        presentPeerIds: [
          ...state.presentPeerIds.filter(peerId => peerId !== event.peer.id),
          event.peer.id,
        ],
      };

    case "peer/left": {
      const check = activeReadyCheck(state);
      return {
        ...state,
        presentPeerIds: state.presentPeerIds.filter(peerId => peerId !== event.peerId),
        timeline: check
          ? updateReadyCheckEntry(state.timeline, check.id, entry => ({
              votes: entry.votes.filter(vote => vote.peerId !== event.peerId),
            }))
          : state.timeline,
      };
    }

    case "peer/playhead-reported":
      return state;

    case "chat/message-added":
      return {
        ...state,
        timeline: [...state.timeline, event.message],
      };

    case "playback/changed":
      return {
        ...state,
        playback: event.playback,
      };

    case "playlist/item-added":
      return {
        ...state,
        playlist: [...state.playlist, event.item],
        currentItemId: state.currentItemId ?? event.item.id,
      };

    case "playlist/item-removed": {
      const playlist = state.playlist.filter(item => item.id !== event.itemId);
      const removedCurrent = state.currentItemId === event.itemId;
      return {
        ...state,
        playlist,
        currentItemId: removedCurrent ? playlist[0]?.id : state.currentItemId,
        suggestedSubtitleDelays: state.suggestedSubtitleDelays.filter(
          delay => delay.itemId !== event.itemId,
        ),
      };
    }

    case "playlist/item-edited":
      return {
        ...state,
        playlist: state.playlist.map(item =>
          item.id === event.itemId ? { ...item, ...event.patch } : item,
        ),
        suggestedSubtitleDelays: event.patch.subtitles
          ? state.suggestedSubtitleDelays.filter(delay => delay.itemId !== event.itemId)
          : state.suggestedSubtitleDelays,
      };

    case "playlist/selected":
      return {
        ...state,
        currentItemId: event.itemId,
      };

    case "ready-check/started":
      return {
        ...state,
        timeline: [...state.timeline, event.entry],
      };

    case "ready-check/voted":
      return {
        ...state,
        timeline: updateReadyCheckEntry(state.timeline, event.checkId, entry => ({
          votes: entry.votes.map(vote =>
            vote.peerId === event.peerId ? { ...vote, vote: event.vote } : vote,
          ),
        })),
      };

    case "ready-check/completed":
      return {
        ...state,
        timeline: updateReadyCheckEntry(state.timeline, event.checkId, () => ({
          completed: true,
        })),
      };

    case "room/config-updated":
      return {
        ...state,
        config: event.config,
      };

    case "subtitle-delay/changed":
      return {
        ...state,
        suggestedSubtitleDelays: [
          ...state.suggestedSubtitleDelays.filter(
            delay => delay.itemId !== event.itemId || delay.trackIndex !== event.trackIndex,
          ),
          {
            itemId: event.itemId,
            trackIndex: event.trackIndex,
            delayMs: event.delayMs,
          },
        ],
      };
  }
}
