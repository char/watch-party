import * as v from "@badrap/valita";
import { Signal } from "@char/aftercare";
import { PlaylistItem } from "../../common/playlist.ts";
import { bindValue, onEvent } from "../util.ts";

export const createCreationForm = (createCallback: (id: string) => void) => {
  const id = new Signal("");
  const video = new Signal("");

  const subtitles = new SubtitlesContainer();

  return (
    <form
      _tap={onEvent("submit", async ev => {
        ev.preventDefault();
        const response = await fetch("/api/session", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: id.get() || undefined,
            playlist: [
              {
                video: video.get(),
                subtitles: subtitles.subtitles.map(it => ({
                  name: it.name.get() || "English",
                  url: it.url.get(),
                })),
              },
            ] satisfies PlaylistItem[],
          }),
        });
        const info = v
          .object({ id: v.string() })
          .parse(await response.json(), { mode: "passthrough" });
        createCallback(info.id);
      })}
    >
      <label htmlFor="session-id">
        id <small>(leave blank to generate random)</small>
      </label>
      <input _tap={bindValue(id)} id="session-id" placeholder="my-movie" />

      <label htmlFor="video-url">video URL</label>
      <input
        _tap={bindValue(video)}
        id="video-url"
        type="url"
        placeholder="https://example.com/my-movie.mp4"
        required
      />

      <label>subtitles</label>
      {subtitles.elem}

      <button role="submit">create</button>
    </form>
  );
};

class SubtitlesContainer {
  addButton = (<button>add</button>);
  elem = (<div _tap={it => (it.style.display = "contents")} />);

  subtitles: { name: Signal<string>; url: Signal<string> }[] = [];

  constructor() {
    this.elem.append(this.addButton);
    this.addButton.style.maxWidth = "fit-content";
    this.addButton.addEventListener("click", e => {
      e.preventDefault();
      this.add();
    });
  }

  add() {
    const subtitle = { name: new Signal(""), url: new Signal("") };
    const group = (
      <div className="group">
        <input
          _tap={bindValue(subtitle.url)}
          type="url"
          placeholder="https://…/my-subs.vtt"
          required
        />
        <input _tap={bindValue(subtitle.name)} placeholder="English" />
      </div>
    );
    const remove = () => {
      this.subtitles = this.subtitles.filter(it => it !== subtitle);
      group.remove();
    };
    group.append(
      <button _tap={onEvent("click", () => remove())} className="danger">
        -
      </button>,
    );

    this.subtitles.push(subtitle);
    this.elem.append(group);
    this.elem.append(this.addButton); // place the add button at the bottom
  }
}
