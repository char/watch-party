import { Signal } from "@char/aftercare";
import { PlaylistItem } from "../../common/playlist.ts";
import { bindValue, onEvent } from "../util.ts";

export class MirrorsContainer {
  addButton = (<button type="button">add mirror</button>);
  elem = (<div id="mirrors" />);

  mirrors: Signal<string>[] = [];

  constructor() {
    this.elem.append(this.addButton);
    this.addButton.style.maxWidth = "fit-content";
    this.addButton.addEventListener("click", e => {
      e.preventDefault();
      this.add();
    });
  }

  add() {
    const mirror = new Signal("");
    const group = (
      <div className="group">
        <input
          _also={bindValue(mirror)}
          type="url"
          placeholder="https://…/my-video.mp4"
          required
        />
        <button
          type="button"
          _also={onEvent("click", () => {
            this.mirrors = this.mirrors.filter(it => it !== mirror);
            group.remove();
          })}
          className="danger"
        >
          -
        </button>
      </div>
    );
    this.mirrors.push(mirror);
    this.elem.append(group);
    this.elem.append(this.addButton);

    return mirror;
  }

  reify(): PlaylistItem["mirrors"] {
    return this.mirrors.map(it => it.get());
  }
}

export class SubtitlesContainer {
  addButton = (<button type="button">add</button>);
  elem = (<div _also={it => (it.style.display = "contents")} />);

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
          _also={bindValue(subtitle.url)}
          type="url"
          placeholder="https://…/my-subs.vtt"
          required
        />
        <input _also={bindValue(subtitle.name)} placeholder="English" />
      </div>
    );
    const remove = () => {
      this.subtitles = this.subtitles.filter(it => it !== subtitle);
      group.remove();
    };
    group.append(
      <button _also={onEvent("click", () => remove())} type="button" className="danger">
        -
      </button>,
    );

    this.subtitles.push(subtitle);
    this.elem.append(group);
    this.elem.append(this.addButton); // place the add button at the bottom

    return subtitle;
  }

  reify(): PlaylistItem["subtitles"] {
    return this.subtitles.map(it => ({
      name: it.name.get() || "English",
      url: it.url.get(),
    }));
  }
}
