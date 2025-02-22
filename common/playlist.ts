import * as v from "@badrap/valita";

export interface PlaylistItem {
  video: string;
  mirrors: string[];
  subtitles: { name: string; url: string }[];
}

export const PlaylistItemSchema = v.object({
  video: v.string(),
  mirrors: v.array(v.string()).default([]),
  subtitles: v.array(v.object({ name: v.string(), url: v.string() })).default([]),
});
