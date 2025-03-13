import { Signal } from "@char/aftercare";
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
          _tap={bindValue(mirror)}
          type="url"
          placeholder="https://…/my-video.mp4"
          required
        />
        <button
          type="button"
          _tap={onEvent("click", () => {
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
  }
}

export class SubtitlesContainer {
  addButton = (<button type="button">add</button>);
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
      <button _tap={onEvent("click", () => remove())} type="button" className="danger">
        -
      </button>,
    );

    this.subtitles.push(subtitle);
    this.elem.append(group);
    this.elem.append(this.addButton); // place the add button at the bottom
  }
}
