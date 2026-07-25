import * as j from "@char/justin";

function tagged<Type extends string, Shape extends Record<string, j.AnySchema>>(
  type: Type,
  shape: Shape,
) {
  return j.obj({ ...shape, type: j.literal(type) });
}

const PeerSchema = j.obj({
  id: j.string,
  nickname: j.string,
  displayColor: j.string,
});

const SubtitleTrackSchema = j.obj({
  name: j.string,
  url: j.string,
});

const NewPlaylistItemSchema = j.obj({
  video: j.string,
  mirrors: j.array(j.string),
  subtitles: j.array(SubtitleTrackSchema),
  isAudio: j.optional(j.boolean),
});

const PlaylistItemSchema = j.obj({
  ...NewPlaylistItemSchema.shape,
  id: j.string,
  addedBy: j.optional(j.string),
});

const PlaylistItemPatchSchema = j.obj({
  video: j.optional(j.string),
  mirrors: j.optional(j.array(j.string)),
  subtitles: j.optional(j.array(SubtitleTrackSchema)),
  isAudio: j.optional(j.boolean),
});

const PlaybackFields = {
  positionMs: j.number,
  paused: j.boolean,
};

const PlaybackStateSchema = j.obj({
  ...PlaybackFields,
  updatedAtServerMs: j.number,
});

const ChatFacetSchema = j.obj({
  type: j.union(
    j.literal("link"),
    j.literal("strong"),
    j.literal("emphasis"),
    j.literal("custom-emoji"),
    j.literal("color"),
  ),
  start: j.number,
  end: j.number,
  link: j.optional(j.string),
  id: j.optional(j.string),
  color: j.optional(j.string),
});

const TimelineEntryFields = {
  id: j.string,
  timestamp: j.number,
};

const ChatMessageSchema = tagged("chat", {
  ...TimelineEntryFields,
  from: j.string,
  text: j.string,
  facets: j.array(ChatFacetSchema),
});

const SystemMessageSchema = tagged("system-message", {
  ...TimelineEntryFields,
  peerId: j.optional(j.string),
  text: j.string,
});

const MessageSchema = j.discriminatedUnion("type", [ChatMessageSchema, SystemMessageSchema]);

const ReadyCheckVoteSchema = j.union(j.literal("yes"), j.literal("no"), j.literal("abstain"));

const ReadyCheckEntrySchema = tagged("ready-check", {
  ...TimelineEntryFields,
  initiator: j.string,
  votes: j.array(j.obj({ peerId: j.string, vote: j.optional(ReadyCheckVoteSchema) })),
  endsAtServerMs: j.number,
  completed: j.boolean,
});

const TimelineEntrySchema = j.discriminatedUnion("type", [
  ChatMessageSchema,
  SystemMessageSchema,
  ReadyCheckEntrySchema,
]);

const RoomConfigSchema = j.obj({
  autoLock: j.optional(j.boolean),
});

const SuggestedSubtitleDelaySchema = j.obj({
  itemId: j.string,
  trackIndex: j.number,
  delayMs: j.number,
});

const RoomSnapshotSchema = j.obj({
  id: j.string,
  peerProfiles: j.array(PeerSchema),
  presentPeerIds: j.array(j.string),
  playlist: j.array(PlaylistItemSchema),
  currentItemId: j.optional(j.string),
  playback: PlaybackStateSchema,
  suggestedSubtitleDelays: j.array(SuggestedSubtitleDelaySchema),
  timeline: j.array(TimelineEntrySchema),
  config: RoomConfigSchema,
});

const ClientCommandSchema = j.discriminatedUnion("type", [
  tagged("chat/send", {
    text: j.string,
    facets: j.array(ChatFacetSchema),
  }),
  tagged("playback/set", PlaybackFields),
  tagged("playback/request-sync", {}),
  tagged("playhead/report", PlaybackFields),
  tagged("playlist/append", { item: NewPlaylistItemSchema }),
  tagged("playlist/remove", { itemId: j.string }),
  tagged("playlist/edit", {
    itemId: j.string,
    patch: PlaylistItemPatchSchema,
  }),
  tagged("playlist/select", { itemId: j.optional(j.string) }),
  tagged("ready-check/start", {}),
  tagged("ready-check/vote", {
    checkId: j.string,
    vote: j.union(j.literal("yes"), j.literal("no")),
  }),
  tagged("ready-check/end", { checkId: j.string }),
  tagged("room/update-config", {
    editToken: j.string,
    config: RoomConfigSchema,
  }),
  tagged("subtitle-delay/set", {
    editToken: j.string,
    itemId: j.string,
    trackIndex: j.number,
    delayMs: j.number,
  }),
  tagged("peer/leave", {}),
]);

const RoomEventSchema = j.discriminatedUnion("type", [
  tagged("peer/joined", { peer: PeerSchema }),
  tagged("peer/left", {
    peerId: j.string,
    reason: j.union(j.literal("disconnect"), j.literal("timeout"), j.literal("error")),
  }),
  tagged("peer/playhead-reported", {
    peerId: j.string,
    ...PlaybackFields,
  }),
  tagged("chat/message-added", { message: MessageSchema }),
  tagged("playback/changed", {
    by: j.optional(j.string),
    playback: PlaybackStateSchema,
  }),
  tagged("playlist/item-added", {
    by: j.string,
    item: PlaylistItemSchema,
  }),
  tagged("playlist/item-removed", {
    by: j.string,
    itemId: j.string,
  }),
  tagged("playlist/item-edited", {
    by: j.string,
    itemId: j.string,
    patch: PlaylistItemPatchSchema,
  }),
  tagged("playlist/selected", {
    by: j.optional(j.string),
    itemId: j.optional(j.string),
  }),
  tagged("ready-check/started", { entry: ReadyCheckEntrySchema }),
  tagged("ready-check/voted", {
    checkId: j.string,
    peerId: j.string,
    vote: ReadyCheckVoteSchema,
  }),
  tagged("ready-check/completed", { checkId: j.string }),
  tagged("room/config-updated", { config: RoomConfigSchema }),
  tagged("subtitle-delay/changed", {
    by: j.string,
    itemId: j.string,
    trackIndex: j.number,
    delayMs: j.number,
  }),
]);

const ServerPacketSchema = j.discriminatedUnion("type", [
  tagged("hello", {
    self: PeerSchema,
    resumeToken: j.string,
    snapshot: RoomSnapshotSchema,
    serverTimeMs: j.number,
  }),
  tagged("event", {
    event: RoomEventSchema,
    serverTimeMs: j.number,
  }),
  tagged("error", { message: j.string }),
]);

const CreateRoomRequestSchema = j.obj({
  id: j.optional(j.string),
  playlist: j.optional(j.array(NewPlaylistItemSchema)),
  config: j.optional(RoomConfigSchema),
});

export const validateClientCommand = j.compile(ClientCommandSchema);
export const validateServerPacket = j.compile(ServerPacketSchema);
export const validateCreateRoomRequest = j.compile(CreateRoomRequestSchema);

export type Peer = j.Infer<typeof PeerSchema>;
export type SubtitleTrack = j.Infer<typeof SubtitleTrackSchema>;
export type NewPlaylistItem = j.Infer<typeof NewPlaylistItemSchema>;
export type PlaylistItem = j.Infer<typeof PlaylistItemSchema>;
export type PlaylistItemPatch = j.Infer<typeof PlaylistItemPatchSchema>;
export type PlaybackState = j.Infer<typeof PlaybackStateSchema>;
export type ChatFacet = j.Infer<typeof ChatFacetSchema>;
export type ChatMessage = j.Infer<typeof ChatMessageSchema>;
export type SystemMessage = j.Infer<typeof SystemMessageSchema>;
export type Message = j.Infer<typeof MessageSchema>;
export type ReadyCheckVote = j.Infer<typeof ReadyCheckVoteSchema>;
export type ReadyCheckEntry = j.Infer<typeof ReadyCheckEntrySchema>;
export type TimelineEntry = j.Infer<typeof TimelineEntrySchema>;
export type RoomConfig = j.Infer<typeof RoomConfigSchema>;
export type SuggestedSubtitleDelay = j.Infer<typeof SuggestedSubtitleDelaySchema>;
export type RoomSnapshot = j.Infer<typeof RoomSnapshotSchema>;
export type ClientCommand = j.Infer<typeof ClientCommandSchema>;
export type RoomEvent = j.Infer<typeof RoomEventSchema>;
export type ServerPacket = j.Infer<typeof ServerPacketSchema>;
