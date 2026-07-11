import { createMediaController } from "../effects/media.tsx";
import type { LocalPrefs } from "../prefs.ts";
import type { Session } from "../session.ts";
import { Chat } from "./Chat.tsx";
import { PeerDialog } from "./Peers.tsx";
import { PlaylistDialog } from "./Playlist.tsx";

export function RoomScreen(session: Session, prefs: LocalPrefs) {
  const abort = new AbortController();
  const playlist = PlaylistDialog(session);
  const peers = PeerDialog(session);
  const media = createMediaController(session, prefs);
  const status = <div class="connection-status" />;

  const player = (
    <div id="player" style={{ "--chat-width": prefs.sidebarWidth }}>
      {media.elem}
      <div id="sidebar-resizer"></div>
      <div id="sidebar">
        {status}
        {Chat({
          session,
          prefs,
          openPlaylist: () => playlist.showModal(),
          openPeers: () => peers.showModal(),
          activeSubtitleTrackIndex: media.activeSubtitleTrackIndex,
          setSubtitleDelay: media.setSubtitleDelay,
        })}
      </div>
      {playlist}
      {peers}
    </div>
  ) as HTMLElement;

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    abort.abort();
    media.dispose();
  };

  session.status.subscribeImmediate(value => {
    status.textContent = value === "connected" ? "" : value;
    if (value === "closed") dispose();
  });

  const resizer = player.querySelector("#sidebar-resizer") as HTMLElement;
  let resizing = false;
  resizer.addEventListener(
    "pointerdown",
    event => {
      event.preventDefault();
      resizing = true;
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "pointermove",
    event => {
      if (!resizing) return;
      const rect = player.getBoundingClientRect();
      const width = Math.max(260, rect.right - event.clientX);
      prefs.sidebarWidth.set(`${width}px`);
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "pointerup",
    () => {
      resizing = false;
    },
    { signal: abort.signal },
  );

  return player;
}
