import { PlaylistItem } from "../../common/playlist.ts";
import { SessionConnection } from "../state/connection.ts";
import { PlayheadOverride, PlaylistChange } from "../state/video-state.ts";
import { createPlaylistAppendForm } from "./append-to-playlist.tsx";
import { MirrorsContainer, SubtitlesContainer } from "./playlist-editing.tsx";

export class PlaylistManagement {
  #playlistDisplay = (<div />);

  elem = (
    <dialog className="playlist-management">
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

    this.elem.append(
      <details>
        <summary>
          <h2>add new item</h2>
        </summary>
        {createPlaylistAppendForm(session)}
      </details>,
    );
  }
  renderItem(item: PlaylistItem, idx: number, active: boolean): Element {
    const skipTo = () => {
      this.session.video.fire(PlayheadOverride, "local", Date.now(), 0, true, true);
      this.session.send({ type: "ChangePlaylistIndex", playlistIndex: idx });
    };
    const remove = () => {
      this.session.send({ type: "RemoveFromPlaylist", url: item.video, playlistIndex: idx });
    };

    const mirrors = new MirrorsContainer();
    for (const mirror of item.mirrors) {
      mirrors.add().set(mirror);
    }
    const subtitles = new SubtitlesContainer();
    for (const subtitle of item.subtitles) {
      const s = subtitles.add();
      s.name.set(subtitle.name);
      s.url.set(subtitle.url);
    }

    const edit = () => {
      this.session.send({
        type: "EditPlaylistItem",
        playlistIndex: idx,
        item: {
          video: item.video,
          mirrors: mirrors.mirrors.map(it => it.get()),
          subtitles: subtitles.subtitles.map(it => ({
            name: it.name.get() || "English",
            url: it.url.get(),
          })),
        },
      });
    };

    return (
      <details classList={["playlist-item", active ? "active" : undefined]}>
        <summary>
          <h2>{item.video}</h2>
          {item.fromPeer ? (
            <p>
              added by{" "}
              <span style={{ color: item.fromPeer.displayColor }}>
                {item.fromPeer.nickname}
              </span>
            </p>
          ) : (
            ""
          )}

          <section className="controls">
            {active ? (
              ""
            ) : (
              <button type="button" _onclick={skipTo}>
                skip to
              </button>
            )}
            <button type="button" _onclick={remove}>
              remove
            </button>
            {/* <button type="button">up</button>
          <button type="button">down</button> */}
          </section>
        </summary>

        <section className="edit">
          {mirrors.elem}
          {subtitles.elem}

          <button type="button" _onclick={edit}>
            apply edits
          </button>
        </section>
      </details>
    );
  }
}
