import { PlaylistItem } from "../../common/playlist.ts";
import { SessionConnection } from "../state/connection.ts";
import { PlaylistChange } from "../state/video-state.ts";
import { createPlaylistAppendForm } from "./append-to-playlist.tsx";

export class PlaylistManagement {
  #playlistDisplay = (<div />);

  elem = (
    <dialog>
      <h1>playlist</h1>
      <p>you can do the thingy</p>
      {this.#playlistDisplay}
    </dialog>
  ) as HTMLDialogElement;

  constructor(public session: SessionConnection) {
    this.elem.addEventListener("click", e => {
      const rect = this.elem.getBoundingClientRect();
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!isInDialog) this.elem.close();
    });

    for (let idx = 0; idx < session.video.playlist.length; idx++) {
      const item = session.video.playlist[idx];
      const active = idx === session.video.playlistIndex;
      this.#playlistDisplay.append(this.renderItem(item, idx, active));
    }

    session.video.on(PlaylistChange, ev => {
      this.#playlistDisplay.innerHTML = "";

      for (let idx = 0; idx < ev.playlist.length; idx++) {
        const item = ev.playlist[idx];
        const active = idx === ev.playlistIndex;
        this.#playlistDisplay.append(this.renderItem(item, idx, active));
      }
    });

    this.elem.append(createPlaylistAppendForm(session));
  }
  renderItem(item: PlaylistItem, idx: number, active: boolean): Element {
    const skipTo = () => {
      this.session.send({ type: "ChangePlaylistIndex", playlistIndex: idx });
    };

    return (
      <article className="playlist-item">
        <h2>{item.video}</h2>
        {item.fromPeer ? (
          <p>
            added by{" "}
            <span style={{ color: item.fromPeer.displayColor }}>{item.fromPeer.nickname}</span>
          </p>
        ) : (
          ""
        )}
        <section style={{ display: "flex", flexDirection: "row", gap: "1em" }}>
          {active ? (
            ""
          ) : (
            <button type="button" _onclick={skipTo}>
              skip to
            </button>
          )}
          {/* <button type="button">up</button>
          <button type="button">down</button> */}
        </section>
      </article>
    );
  }
}
