import * as z from "@zod/mini";
import { PlaylistItemSchema } from "./playlist.ts";

const ConnectionIdSchema = z.string();

const HandshakeSchema = z.object({
  type: z.literal("Handshake"),
  nickname: z.string(),
  displayColor: z.string(),

  connectionId: z.string(),
  resumptionToken: z.string(),

  session: z.string(),
  playlist: PlaylistItemSchema.pipe(z.array),
  playlistIndex: z.number(),
  paused: z.boolean(),
  playhead: z.number(),
  playheadTimestamp: z.number(),
});

const PeerAddedSchema = z.object({
  type: z.literal("PeerAdded"),
  connectionId: ConnectionIdSchema,
  nickname: z.string(),
  displayColor: z.string(),
});

const PeerDroppedSchema = z.object({
  type: z.literal("PeerDropped"),
  connectionId: ConnectionIdSchema,
  reason: z.union([z.literal("disconnect"), z.literal("timeout")]),
});

const RequestPeerListSchema = z.object({
  type: z.literal("RequestPeerList"),
});
const FullUserListSchema = z.object({
  type: z.literal("FullPeerList"),
  peers: z
    .object({ connectionId: z.string(), nickname: z.string(), displayColor: z.string() })
    .pipe(z.array),
});

const LeaveSessionSchema = z.object({
  type: z.literal("LeaveSession"),
});

const ChangePlayheadSchema = z.object({
  type: z.literal("ChangePlayhead"),
  playhead: z.number(),
  paused: z.boolean(),
});
const ServerChangePlayheadSchema = z.extend(ChangePlayheadSchema, {
  from: z.optional(ConnectionIdSchema),
});

const RequestPlayheadSyncSchema = z.object({
  type: z.literal("RequestPlayheadSync"),
});

const ReportPlayheadSchema = z.object({
  type: z.literal("ReportPlayhead"),
  playhead: z.number(),
  paused: z.boolean(),
});
const ServerReportPlayheadSchema = z.extend(ReportPlayheadSchema, {
  from: ConnectionIdSchema,
});

const AppendToPlaylistSchema = z.object({
  type: z.literal("AppendToPlaylist"),
  item: PlaylistItemSchema,
});
const RemoveFromPlaylistSchema = z.object({
  type: z.literal("RemoveFromPlaylist"),
  url: z.string(),
  playlistIndex: z.number(),
});
const ChangePlaylistIndexSchema = z.object({
  type: z.literal("ChangePlaylistIndex"),
  playlistIndex: z.number(),
});
const EditPlaylistItemSchema = z.object({
  type: z.literal("EditPlaylistItem"),
  playlistIndex: z.number(),
  item: PlaylistItemSchema,
});
const ServerPlaylistUpdateSchema = z.object({
  type: z.literal("PlaylistUpdate"),
  playlist: z.array(PlaylistItemSchema),
  playlistIndex: z.number(),
  from: z.optional(ConnectionIdSchema),
});

const facetSpan = <T extends z.ZodMiniObject>(it: T) =>
  z.extend(it, { start: z.number(), end: z.number() });
const ChatFacetSchema = z.discriminatedUnion(
  [
    z.object({ type: z.literal("link"), link: z.string() }).pipe(facetSpan),
    z.object({ type: z.literal("strong") }).pipe(facetSpan),
    z.object({ type: z.literal("emphasis") }).pipe(facetSpan),
    z.object({ type: z.literal("custom-emoji"), id: z.string() }).pipe(facetSpan),
    z.object({ type: z.literal("color"), color: z.string() }).pipe(facetSpan),
  ], // utf-16 code units
);
export type ChatFacet = z.infer<typeof ChatFacetSchema>;

const ChatMessageSchema = z.object({
  type: z.literal("ChatMessage"),
  text: z.string(),
  facets: ChatFacetSchema.pipe(z.array),
});

const ServerChatMessageSchema = z.extend(ChatMessageSchema, { from: ConnectionIdSchema });
type asdf = z.infer<typeof ServerChatMessageSchema>;

const ChatHistorySchema = z.object({
  type: z.literal("ChatHistory"),
  messages: z
    .object({
      from: z.object({
        connectionId: z.string(),
        nickname: z.string(),
        displayColor: z.string(),
      }),
      text: z.string(),
      facets: ChatFacetSchema.pipe(z.array),
      system: z.boolean(),
    })
    .pipe(z.array),
});

export const ClientPacketSchema = z.discriminatedUnion([
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

export const ServerPacketSchema = z.discriminatedUnion([
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

type MaybeSpecific<Packet, Type extends string | undefined> = Packet &
  (Type extends undefined ? object : { type: Type });

type AnyClientPacket = z.input<typeof ClientPacketSchema>;
export type ClientPacket<T extends AnyClientPacket["type"] | undefined = undefined> =
  MaybeSpecific<AnyClientPacket, T>;
type AnyServerPacket = z.input<typeof ServerPacketSchema>;
export type ServerPacket<T extends AnyServerPacket["type"] | undefined = undefined> =
  MaybeSpecific<AnyServerPacket, T>;
