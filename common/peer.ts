import * as v from "@badrap/valita";

export interface Peer {
  connectionId: string;
  nickname: string;
  displayColor: string;
}

export const PeerSchema = v.object({
  connectionId: v.string(),
  nickname: v.string(),
  displayColor: v.string(),
});
