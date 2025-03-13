import * as v from "@badrap/valita";
import { Peer, PeerSchema } from "./peer.ts";

export interface PlaylistItem {
  video: string;
  mirrors: string[];
  subtitles: { name: string; url: string }[];
  fromPeer?: Peer; // connection id
}

export const PlaylistItemSchema = v.object({
  video: v.string(),
  mirrors: v.array(v.string()).default([]),
  subtitles: v.array(v.object({ name: v.string(), url: v.string() })).default([]),
  fromPeer: PeerSchema.optional(),
});
