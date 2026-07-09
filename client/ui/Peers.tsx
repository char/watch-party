import { formatTime } from "../lib/format.ts";
import type { Session } from "../session.ts";

export function PeerDialog(session: Session) {
  const list = <ul />;
  const dialog = (
    <dialog class="peer-list" closedBy="any">
      <h1>peers</h1>
      {list}
    </dialog>
  ) as HTMLDialogElement;
  const playheads = new Map<string, { positionMs: number; paused: boolean }>();

  const render = () => {
    list.textContent = "";
    const present = new Set(session.room.presentPeerIds);
    for (const peer of session.room.peerProfiles) {
      if (!present.has(peer.id)) continue;
      const playhead = playheads.get(peer.id);
      list.append(
        <li>
          <strong style={{ color: peer.displayColor }}>{peer.nickname}</strong>
          {playhead ? (
            <small>
              {" "}
              {playhead.paused ? "paused" : "playing"} {formatTime(playhead.positionMs)}
            </small>
          ) : (
            ""
          )}
        </li>,
      );
    }
  };

  render();
  session.onRoomChange((room, previous) => {
    if (
      room.peerProfiles !== previous.peerProfiles ||
      room.presentPeerIds !== previous.presentPeerIds
    )
      render();
  });
  session.onEvent(event => {
    if (event.type === "peer/playhead-reported") {
      playheads.set(event.peerId, {
        positionMs: event.positionMs,
        paused: event.paused,
      });
      render();
    }
    if (event.type === "peer/left") playheads.delete(event.peerId);
  });

  return dialog;
}
