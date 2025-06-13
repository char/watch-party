import * as j from "@char/justin";
import { PlaylistItemSchema } from "./playlist.ts";

const ConnectionIdSchema = j.string;

const HandshakeSchema = j.obj({
  type: j.literal("Handshake"),
  nickname: j.string,
  displayColor: j.string,

  connectionId: j.string,
  resumptionToken: j.string,

  session: j.string,
  playlist: PlaylistItemSchema.pipe(j.array),
  playlistIndex: j.number,
  paused: j.boolean,
  playhead: j.number,
  playheadTimestamp: j.number,
});

const PeerAddedSchema = j.obj({
  type: j.literal("PeerAdded"),
  connectionId: ConnectionIdSchema,
  nickname: j.string,
  displayColor: j.string,
});

const PeerDroppedSchema = j.obj({
  type: j.literal("PeerDropped"),
  connectionId: ConnectionIdSchema,
  reason: j.union(j.literal("disconnect"), j.literal("timeout")),
});

const RequestPeerListSchema = j.obj({
  type: j.literal("RequestPeerList"),
});
const FullUserListSchema = j.obj({
  type: j.literal("FullPeerList"),
  peers: j
    .obj({ connectionId: j.string, nickname: j.string, displayColor: j.string })
    .pipe(j.array),
});

const LeaveSessionSchema = j.obj({
  type: j.literal("LeaveSession"),
});

const ChangePlayheadSchema = j.obj({
  type: j.literal("ChangePlayhead"),
  playhead: j.number,
  paused: j.boolean,
});
const ServerChangePlayheadSchema = j.obj({
  ...ChangePlayheadSchema.shape,
  from: j.optional(ConnectionIdSchema),
});

const RequestPlayheadSyncSchema = j.obj({
  type: j.literal("RequestPlayheadSync"),
});

const ReportPlayheadSchema = j.obj({
  type: j.literal("ReportPlayhead"),
  playhead: j.number,
  paused: j.boolean,
});
const ServerReportPlayheadSchema = j.obj({
  ...ReportPlayheadSchema.shape,
  from: ConnectionIdSchema,
});

const AppendToPlaylistSchema = j.obj({
  type: j.literal("AppendToPlaylist"),
  item: PlaylistItemSchema,
});
const RemoveFromPlaylistSchema = j.obj({
  type: j.literal("RemoveFromPlaylist"),
  url: j.string,
  playlistIndex: j.number,
});
const ChangePlaylistIndexSchema = j.obj({
  type: j.literal("ChangePlaylistIndex"),
  playlistIndex: j.number,
});
const EditPlaylistItemSchema = j.obj({
  type: j.literal("EditPlaylistItem"),
  playlistIndex: j.number,
  item: PlaylistItemSchema,
});
const ServerPlaylistUpdateSchema = j.obj({
  type: j.literal("PlaylistUpdate"),
  playlist: j.array(PlaylistItemSchema),
  playlistIndex: j.number,
  from: j.optional(ConnectionIdSchema),
});

const facetSpan = <const Shape extends Record<string, j.AnySchema>>(
  it: j.ObjectSchema<Shape>,
) => j.obj({ ...it.shape, start: j.number, end: j.number });
const ChatFacetSchema = j.discriminatedUnion(
  "type",
  [
    j.obj({ type: j.literal("link"), link: j.string }).pipe(facetSpan),
    j.obj({ type: j.literal("strong") }).pipe(facetSpan),
    j.obj({ type: j.literal("emphasis") }).pipe(facetSpan),
    j.obj({ type: j.literal("custom-emoji"), id: j.string }).pipe(facetSpan),
    j.obj({ type: j.literal("color"), color: j.string }).pipe(facetSpan),
  ], // utf-16 code units
);
export type ChatFacet = j.Infer<typeof ChatFacetSchema>;

const ChatMessageSchema = j.obj({
  type: j.literal("ChatMessage"),
  text: j.string,
  facets: ChatFacetSchema.pipe(j.array),
});

const ServerChatMessageSchema = j.obj({ ...ChatMessageSchema.shape, from: ConnectionIdSchema });

const ChatHistorySchema = j.obj({
  type: j.literal("ChatHistory"),
  messages: j
    .obj({
      from: j.obj({
        connectionId: j.string,
        nickname: j.string,
        displayColor: j.string,
      }),
      text: j.string,
      facets: ChatFacetSchema.pipe(j.array),
      system: j.boolean,
    })
    .pipe(j.array),
});

export const ClientPacketSchema = j.discriminatedUnion("type", [
  LeaveSessionSchema,
  ChatMessageSchema,
  RequestPeerListSchema,
  ChangePlayheadSchema,
  RequestPlayheadSyncSchema,
  ReportPlayheadSchema,
  AppendToPlaylistSchema,
  RemoveFromPlaylistSchema,
  ChangePlaylistIndexSchema,
  EditPlaylistItemSchema,
]);
export const validateClientPacket = j.compile(ClientPacketSchema);

export const ServerPacketSchema = j.discriminatedUnion("type", [
  HandshakeSchema,
  PeerAddedSchema,
  PeerDroppedSchema,
  ServerChatMessageSchema,
  FullUserListSchema,
  ServerChangePlayheadSchema,
  ChatHistorySchema,
  ServerReportPlayheadSchema,
  ServerPlaylistUpdateSchema,
]);
export const validateServerPacket = j.compile(ServerPacketSchema);

type MaybeSpecific<Packet, Type extends string | undefined> = Packet &
  (Type extends undefined ? object : { type: Type });

type AnyClientPacket = j.Infer<typeof ClientPacketSchema>;
export type ClientPacket<T extends AnyClientPacket["type"] | undefined = undefined> =
  MaybeSpecific<AnyClientPacket, T>;
type AnyServerPacket = j.Infer<typeof ServerPacketSchema>;
export type ServerPacket<T extends AnyServerPacket["type"] | undefined = undefined> =
  MaybeSpecific<AnyServerPacket, T>;
