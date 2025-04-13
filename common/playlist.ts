import * as z from "zod";
import { Peer, PeerSchema } from "./peer.ts";

export interface PlaylistItem {
  video: string;
  mirrors: string[];
  subtitles: { name: string; url: string }[];
  fromPeer?: Peer; // connection id
  isAudio?: boolean;
}

export const PlaylistItemSchema = z.object({
  video: z.string(),
  mirrors: z.array(z.string()),
  subtitles: z.array(z.object({ name: z.string(), url: z.string() })),
  fromPeer: PeerSchema.optional(),
  isAudio: z.boolean().default(false),
});
