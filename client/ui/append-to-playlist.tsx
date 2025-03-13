import { Signal } from "@char/aftercare";
import { SessionConnection } from "../state/connection.ts";
import { bindValue } from "../util.ts";
import { MirrorsContainer, SubtitlesContainer } from "./playlist-editing.tsx";

export function createPlaylistAppendForm(session: SessionConnection) {
  const video = new Signal("");
  const mirrors = new MirrorsContainer();
  const subtitles = new SubtitlesContainer();

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    session.send({
      type: "AppendToPlaylist",
      item: {
        video: video.get(),
        mirrors: mirrors.mirrors.map(it => it.get()),
        subtitles: subtitles.subtitles.map(it => ({
          name: it.name.get() || "English",
          url: it.url.get(),
        })),
      },
    });
  };

  return (
    <form _onsubmit={submit}>
      <label htmlFor="video-url">video URL</label>
      <input
        _tap={bindValue(video)}
        id="video-url"
        type="url"
        placeholder="https://example.com/my-movie.mp4"
        required
      />

      <label>mirrors:</label>
      {mirrors.elem}
      <label>subtitles:</label>
      {subtitles.elem}

      <button type="submit">append</button>
    </form>
  );
}
