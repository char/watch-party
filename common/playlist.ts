import * as j from "@char/justin";
import { PeerSchema } from "./peer.ts";

export const PlaylistItemSchema = j.obj({
  video: j.string,
  mirrors: j.array(j.string),
  subtitles: j.array(j.obj({ name: j.string, url: j.string })),
  fromPeer: PeerSchema.pipe(j.optional),
  isAudio: j.optional(j.boolean),
});
export type PlaylistItem = j.Infer<typeof PlaylistItemSchema>;
