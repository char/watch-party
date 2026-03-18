import { Signal } from "@char/aftercare";
import "vanilla-colorful/hex-color-picker.js";
import "vanilla-colorful/hex-input.js";
import { app } from "../state/app.ts";
import { bindValue, onEvent } from "../util.ts";

export type ConnectCallback = (sessionId: string, nickname: string) => void;

export const createConnectForm = () => {
  const nickname = new Signal(app.user.get()?.nickname ?? "");
  const displayColor = new Signal(app.user.get()?.displayColor ?? "#ffffff");

  const colorDialog = (
    <dialog
      _also={d => {
        d.addEventListener("click", e => {
          if (e.target === d) d.close();
        });
      }}
    >
      <hex-color-picker
        _also={el => {
          displayColor.subscribeImmediate(v => (el.color = v));
          el.addEventListener("color-changed", (e: CustomEvent<{ value: string }>) => {
            displayColor.set(e.detail.value);
          });
        }}
      />
    </dialog>
  ) as HTMLDialogElement;

  const connectForm = (
    <form
      _also={onEvent("submit", ev => {
        ev.preventDefault();
        app.user.set({ nickname: nickname.get(), displayColor: displayColor.get() });

        app.connect();
      })}
      id="connect-form"
    >
      <label htmlFor="nickname">nickname</label>
      <input _also={bindValue(nickname)} id="nickname" placeholder="nickname" required />

      <label>display name color</label>
      <div class="group" style={{ gap: "0.5em" }}>
        <hex-input
          _also={el => {
            displayColor.subscribeImmediate(v => (el.color = v));
            el.addEventListener("color-changed", e => {
              displayColor.set(e.detail.value);
            });
          }}
        />
        <button
          type="button"
          className="color-swatch"
          _also={btn => {
            displayColor.subscribeImmediate(v => {
              btn.style.backgroundColor = v;
              btn.style.borderColor = v;
            });
            btn.addEventListener("click", () => colorDialog.showModal());
          }}
        />
        {colorDialog}
        {` `}
        <span>
          <strong
            _also={s => {
              nickname.subscribeImmediate(v => (s.textContent = v));
              displayColor.subscribeImmediate(v => (s.style.color = v));
            }}
          />
          : my message
        </span>
      </div>

      <label htmlFor="session-id">session id</label>
      <input
        _also={bindValue(app.sessionId)}
        id="session-id"
        placeholder="{random string}"
        required
      />

      <button type="submit">join</button>
    </form>
  );

  return connectForm;
};
