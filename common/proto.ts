import * as v from "@badrap/valita";
import { PlaylistItemSchema } from "./playlist.ts";

const ConnectionIdSchema = v.string();

const ChatMessageSchema = v.object({
  type: v.literal("ChatMessage"),
  text: v.string(),
  facets: v
    .union(
      ...[
        v.object({ type: v.literal("link"), link: v.string() }),
        v.object({ type: v.literal("strong") }),
        v.object({ type: v.literal("emphasis") }),
        v.object({ type: v.literal("custom-emoji"), id: v.string() }),
        v.object({ type: v.literal("color"), color: v.string() }),
      ].map(it => it.extend({ start: v.number(), end: v.number() })), // utf-16 code units
    )
    .pipe(v.array),
});

const ServerChatMessageSchema = ChatMessageSchema.extend({ from: ConnectionIdSchema });

const HandshakeSchema = v.object({
  type: v.literal("Handshake"),
  nickname: v.string(),
  displayColor: v.string(),

  connectionId: v.string(),
  resumptionToken: v.string(),

  session: v.string(),
  playlist: PlaylistItemSchema.pipe(v.array),
  playlistIndex: v.number(),
  paused: v.boolean(),
  playhead: v.number(),
  playheadTimestamp: v.number(),
});

const PeerAddedSchema = v.object({
  type: v.literal("PeerAdded"),
  connectionId: ConnectionIdSchema,
  nickname: v.string(),
  displayColor: v.string(),
});

const PeerDroppedSchema = v.object({
  type: v.literal("PeerDropped"),
  connectionId: ConnectionIdSchema,
  reason: v.union(v.literal("disconnect"), v.literal("timeout")),
});

const LeaveSessionSchema = v.object({
  type: v.literal("LeaveSession"),
});

const RequestPeerListSchema = v.object({
  type: v.literal("RequestPeerList"),
});
const FullUserListSchema = v.object({
  type: v.literal("FullPeerList"),
  peers: v
    .object({ connectionId: v.string(), nickname: v.string(), displayColor: v.string() })
    .pipe(v.array),
});

const ChangePlayheadSchema = v.object({
  type: v.literal("ChangePlayhead"),
  playhead: v.number(),
  paused: v.boolean(),
});
const ServerChangePlayheadSchema = ChangePlayheadSchema.extend({
  from: ConnectionIdSchema.optional(),
});

export const ClientPacketSchema = v.union(
  LeaveSessionSchema,
  ChatMessageSchema,
  RequestPeerListSchema,
  ChangePlayheadSchema,
);

export const ServerPacketSchema = v.union(
  HandshakeSchema,
  PeerAddedSchema,
  PeerDroppedSchema,
  ServerChatMessageSchema,
  FullUserListSchema,
  ServerChangePlayheadSchema,
);

type MaybeSpecific<Packet, Type extends string | undefined> = Packet &
  (Type extends undefined ? object : { type: Type });

type AnyClientPacket = v.Infer<typeof ClientPacketSchema>;
export type ClientPacket<T extends AnyClientPacket["type"] | undefined = undefined> =
  MaybeSpecific<AnyClientPacket, T>;
type AnyServerPacket = v.Infer<typeof ServerPacketSchema>;
export type ServerPacket<T extends AnyServerPacket["type"] | undefined = undefined> =
  MaybeSpecific<AnyServerPacket, T>;
