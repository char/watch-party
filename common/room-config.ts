import * as j from "@char/justin";

export const RoomConfigSchema = j.obj({
  autoLock: j.optional(j.boolean),
});
export type RoomConfig = j.Infer<typeof RoomConfigSchema>;
