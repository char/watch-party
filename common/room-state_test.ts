import { assert, assertEquals, assertThrows } from "@std/assert";
import { RoomState } from "./room-state.ts";
import type {
  Peer,
  PlaylistItem,
  ReadyCheckEntry,
  RoomEvent,
  RoomSnapshot,
} from "./protocol.ts";

const peer = (id: string): Peer => ({
  id,
  nickname: `nick-${id}`,
  displayColor: "#ffffff",
});

const playlistItem = (id: string): PlaylistItem => ({
  id,
  video: `https://example.com/${id}.mp4`,
  mirrors: [],
  subtitles: [],
});

const readyCheckEntry = (id: string, votes: string[]): ReadyCheckEntry => ({
  type: "ready-check",
  id,
  timestamp: 1000,
  initiator: votes[0] ?? "nobody",
  votes: votes.map(peerId => ({ peerId })),
  endsAtServerMs: 31_000,
  completed: false,
});

function emptySnapshot(): RoomSnapshot {
  return {
    id: "room",
    peerProfiles: [],
    presentPeerIds: [],
    playlist: [],
    currentItemId: undefined,
    playback: { positionMs: 0, paused: true, updatedAtServerMs: 1000 },
    suggestedSubtitleDelays: [],
    timeline: [],
    config: {},
  };
}

function stateWith(...events: RoomEvent[]): RoomState {
  const state = RoomState.empty("room", 1000);
  for (const event of events) state.apply(event);
  return state;
}

Deno.test("peers: join dedupes and rejoins move to the end", () => {
  const state = stateWith(
    { type: "peer/joined", peer: peer("a") },
    { type: "peer/joined", peer: peer("b") },
    { type: "peer/joined", peer: { ...peer("a"), nickname: "renamed" } },
  );

  assertEquals([...state.peers.keys()], ["b", "a"]);
  assertEquals(state.peers.get("a")?.nickname, "renamed");
  assertEquals([...state.presentPeerIds], ["b", "a"]);
});

Deno.test("peers: leaving keeps the profile but drops presence and votes", () => {
  const state = stateWith(
    { type: "peer/joined", peer: peer("a") },
    { type: "peer/joined", peer: peer("b") },
    { type: "ready-check/started", entry: readyCheckEntry("rc", ["a", "b"]) },
    { type: "peer/left", peerId: "a", reason: "disconnect" },
  );

  assert(state.peers.has("a"));
  assertEquals([...state.presentPeerIds], ["b"]);
  assertEquals(state.activeReadyCheck?.votes, [{ peerId: "b" }]);
});

Deno.test("chat: messages append to the timeline", () => {
  const state = stateWith({
    type: "chat/message-added",
    message: { type: "chat", id: "m1", from: "a", text: "hi", facets: [], timestamp: 1 },
  });
  assertEquals(state.timeline.length, 1);
  assertEquals(state.timeline[0].id, "m1");
});

Deno.test("playback: changes replace the authoritative playback", () => {
  const state = stateWith({
    type: "playback/changed",
    by: "a",
    playback: { positionMs: 500, paused: false, updatedAtServerMs: 2000 },
  });
  assertEquals(state.playback, { positionMs: 500, paused: false, updatedAtServerMs: 2000 });
});

Deno.test("playlist: first item becomes current, later additions do not", () => {
  const state = stateWith(
    { type: "playlist/item-added", by: "a", item: playlistItem("i1") },
    { type: "playlist/item-added", by: "a", item: playlistItem("i2") },
  );
  assertEquals(
    state.playlist.map(item => item.id),
    ["i1", "i2"],
  );
  assertEquals(state.currentItemId, "i1");
});

Deno.test("playlist: removing the current item selects the first remaining one", () => {
  const state = stateWith(
    { type: "playlist/item-added", by: "a", item: playlistItem("i1") },
    { type: "playlist/item-added", by: "a", item: playlistItem("i2") },
    {
      type: "subtitle-delay/changed",
      by: "a",
      itemId: "i1",
      trackIndex: 0,
      delayMs: 100,
    },
    { type: "playlist/item-removed", by: "a", itemId: "i1" },
  );
  assertEquals(state.currentItemId, "i2");
  assertEquals(state.suggestedSubtitleDelays, []);
});

Deno.test("playlist: removing the last item clears the selection", () => {
  const state = stateWith(
    { type: "playlist/item-added", by: "a", item: playlistItem("i1") },
    { type: "playlist/item-removed", by: "a", itemId: "i1" },
  );
  assertEquals(state.currentItemId, undefined);
});

Deno.test("playlist: edits merge the patch and invalidate delays on subtitle changes", () => {
  const state = stateWith(
    { type: "playlist/item-added", by: "a", item: playlistItem("i1") },
    {
      type: "subtitle-delay/changed",
      by: "a",
      itemId: "i1",
      trackIndex: 0,
      delayMs: 100,
    },
    {
      type: "playlist/item-edited",
      by: "a",
      itemId: "i1",
      patch: { video: "https://example.com/other.mp4" },
    },
  );

  assertEquals(state.playlist[0].video, "https://example.com/other.mp4");
  assertEquals(state.playlist[0].id, "i1");
  assertEquals(state.suggestedSubtitleDelays.length, 1);

  state.apply({
    type: "playlist/item-edited",
    by: "a",
    itemId: "i1",
    patch: { subtitles: [{ name: "en", url: "https://example.com/en.vtt" }] },
  });
  assertEquals(state.suggestedSubtitleDelays, []);
});

Deno.test("playlist: selection updates the current item", () => {
  const state = stateWith(
    { type: "playlist/item-added", by: "a", item: playlistItem("i1") },
    { type: "playlist/item-added", by: "a", item: playlistItem("i2") },
    { type: "playlist/selected", by: "a", itemId: "i2" },
  );
  assertEquals(state.currentItemId, "i2");
});

Deno.test("ready checks: votes and completion update the entry", () => {
  const state = stateWith(
    { type: "ready-check/started", entry: readyCheckEntry("rc", ["a", "b"]) },
    { type: "ready-check/voted", checkId: "rc", peerId: "a", vote: "yes" },
  );

  assertEquals(state.activeReadyCheck?.votes, [{ peerId: "a", vote: "yes" }, { peerId: "b" }]);

  state.apply({ type: "ready-check/completed", checkId: "rc" });
  assertEquals(state.activeReadyCheck, undefined);
  const entry = state.timeline.find(entry => entry.id === "rc");
  assert(entry?.type === "ready-check" && entry.completed);
});

Deno.test("playhead reports are not durable state", () => {
  const state = stateWith({
    type: "peer/playhead-reported",
    peerId: "a",
    positionMs: 100,
    paused: false,
  });
  assertEquals(state.snapshot(), emptySnapshot());
});

Deno.test("subtitle delays upsert per item and track", () => {
  const state = stateWith(
    { type: "subtitle-delay/changed", by: "a", itemId: "i1", trackIndex: 0, delayMs: 100 },
    { type: "subtitle-delay/changed", by: "a", itemId: "i1", trackIndex: 0, delayMs: 200 },
    { type: "subtitle-delay/changed", by: "a", itemId: "i1", trackIndex: 1, delayMs: 50 },
  );
  assertEquals(state.suggestedSubtitleDelays, [
    { itemId: "i1", trackIndex: 0, delayMs: 200 },
    { itemId: "i1", trackIndex: 1, delayMs: 50 },
  ]);
  assertEquals(state.suggestedSubtitleDelay("i1", 0), 200);
  assertEquals(state.suggestedSubtitleDelay("i1", 3), 0);
});

Deno.test("config updates replace the config", () => {
  const state = stateWith({ type: "room/config-updated", config: { autoLock: true } });
  assertEquals(state.config, { autoLock: true });
});

Deno.test("snapshots round-trip through reset", () => {
  const state = stateWith(
    { type: "peer/joined", peer: peer("a") },
    { type: "playlist/item-added", by: "a", item: playlistItem("i1") },
    {
      type: "chat/message-added",
      message: { type: "chat", id: "m1", from: "a", text: "hi", facets: [], timestamp: 1 },
    },
  );

  const snapshot = state.snapshot();
  const restored = new RoomState(snapshot);
  assertEquals(restored.snapshot(), snapshot);

  const fresh = RoomState.empty("room", 0);
  fresh.reset(snapshot);
  assertEquals(fresh.snapshot(), snapshot);

  assertThrows(() => fresh.reset({ ...snapshot, id: "other-room" }));
});
