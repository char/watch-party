import * as v from "@badrap/valita";
import { Signal } from "@char/aftercare";
import { PlaylistItem } from "../../common/playlist.ts";
import { bindValue, onEvent } from "../util.ts";
import { MirrorsContainer, SubtitlesContainer } from "./playlist-editing.tsx";

export const createCreationForm = (createCallback: (id: string) => void) => {
  const id = new Signal("");
  const video = new Signal("");

  const mirrors = new MirrorsContainer();
  const subtitles = new SubtitlesContainer();

  return (
    <form
      _tap={onEvent("submit", async ev => {
        ev.preventDefault();
        const playlist: PlaylistItem[] = [
          {
            video: video.get(),
            mirrors: mirrors.mirrors.map(it => it.get()),
            subtitles: subtitles.subtitles.map(it => ({
              name: it.name.get() || "English",
              url: it.url.get(),
            })),
          },
        ];
        const response = await fetch("/api/session", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: id.get() || undefined,
            playlist,
          }),
        });
        const info = v
          .object({ id: v.string() })
          .parse(await response.json(), { mode: "passthrough" });
        createCallback(info.id);
      })}
      id="create-form"
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
      {mirrors.elem}

      <label>subtitles</label>
      {subtitles.elem}

      <button type="submit">create</button>
    </form>
  );
};
