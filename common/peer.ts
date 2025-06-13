import * as j from "@char/justin";

export const PeerSchema = j.obj({
  connectionId: j.string,
  nickname: j.string,
  displayColor: j.string,
});
export type Peer = j.Infer<typeof PeerSchema>;
export const validatePeer = j.compile(PeerSchema);
