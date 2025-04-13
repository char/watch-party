import * as z from "zod";

export interface Peer {
  connectionId: string;
  nickname: string;
  displayColor: string;
}

export const PeerSchema = z.object({
  connectionId: z.string(),
  nickname: z.string(),
  displayColor: z.string(),
});
