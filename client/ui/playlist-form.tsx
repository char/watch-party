import { Signal } from "@char/aftercare";
import type { PlaylistItem } from "../../common/model.ts";

export interface PlaylistDraft {
  video: string;
  mirrors: string[];
  subtitles: { name: string; url: string }[];
  isAudio?: boolean;
}

export function PlaylistForm(opts: {
  id?: string;
  before?: Element | Element[];
  submitLabel: string;
  initial?: Partial<PlaylistItem>;
  onSubmit(draft: PlaylistDraft): void;
}) {
  const video = new Signal(opts.initial?.video ?? "");
  const isAudio = new Signal(Boolean(opts.initial?.isAudio));
  const mirrors = new ListEditor("mirror", opts.initial?.mirrors ?? []);
  const subtitles = new SubtitleEditor(opts.initial?.subtitles ?? []);

  return (
    <form
      id={opts.id}
      _onsubmit={(event: SubmitEvent) => {
        event.preventDefault();
        opts.onSubmit({
          video: video.get(),
          mirrors: mirrors.values(),
          subtitles: subtitles.values(),
          isAudio: isAudio.get() || undefined,
        });
      }}
    >
      {opts.before ?? ""}
      <label htmlFor="video-url">video URL</label>
      <input
        id="video-url"
        value={video}
        type="url"
        placeholder="https://example.com/movie.mp4"
        required
      />

      <label class="group">
        <input
          id="is-audio"
          type="checkbox"
          checked={isAudio}
          _onchange={(event: Event) =>
            isAudio.set((event.currentTarget as HTMLInputElement).checked)
          }
        />
        audio-only item
      </label>

      <label>mirrors</label>
      {mirrors.elem}

      <label>subtitles</label>
      {subtitles.elem}

      <button type="submit">{opts.submitLabel}</button>
    </form>
  );
}

class ListEditor {
  readonly elem = (<div />);
  #signals: Signal<string>[] = [];
  #addButton: HTMLButtonElement;

  constructor(
    readonly label: string,
    initial: string[],
  ) {
    this.#addButton = (<button type="button">add {label}</button>) as HTMLButtonElement;
    this.#addButton.addEventListener("click", () => this.add(""));
    this.elem.append(this.#addButton);
    for (const value of initial) this.add(value);
  }

  add(initial: string) {
    const value = new Signal(initial);
    const field = `${this.label}-url`;
    const row = (
      <div class="group">
        <input name={field} value={value} type="url" placeholder="https://…" />
        <button type="button" class="danger">
          -
        </button>
      </div>
    );
    row.querySelector("button")!.addEventListener("click", () => {
      this.#signals = this.#signals.filter(signal => signal !== value);
      row.remove();
    });
    this.#signals.push(value);
    this.elem.insertBefore(row, this.#addButton);
  }

  values(): string[] {
    return this.#signals.map(signal => signal.get()).filter(Boolean);
  }
}

class SubtitleEditor {
  readonly elem = (<div />);
  #signals: { name: Signal<string>; url: Signal<string> }[] = [];
  #addButton: HTMLButtonElement;

  constructor(initial: { name: string; url: string }[]) {
    this.#addButton = (<button type="button">add subtitle</button>) as HTMLButtonElement;
    this.#addButton.addEventListener("click", () => this.add({ name: "", url: "" }));
    this.elem.append(this.#addButton);
    for (const value of initial) this.add(value);
  }

  add(initial: { name: string; url: string }) {
    const subtitle = {
      name: new Signal(initial.name),
      url: new Signal(initial.url),
    };
    const row = (
      <div class="group">
        <input
          name="subtitle-url"
          value={subtitle.url}
          type="url"
          placeholder="https://…/subs.vtt"
        />
        <input name="subtitle-name" value={subtitle.name} placeholder="English" />
        <button type="button" class="danger">
          -
        </button>
      </div>
    );
    row.querySelector("button")!.addEventListener("click", () => {
      this.#signals = this.#signals.filter(signal => signal !== subtitle);
      row.remove();
    });
    this.#signals.push(subtitle);
    this.elem.insertBefore(row, this.#addButton);
  }

  values(): { name: string; url: string }[] {
    return this.#signals
      .map(({ name, url }) => ({
        name: name.get() || "English",
        url: url.get(),
      }))
      .filter(track => track.url);
  }
}
