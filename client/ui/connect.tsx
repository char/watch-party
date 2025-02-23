import { Signal } from "@char/aftercare";
import { app } from "../state/app.ts";
import { bindValue, onEvent } from "../util.ts";

export type ConnectCallback = (sessionId: string, nickname: string) => void;

export const createConnectForm = () => {
  const nickname = new Signal(app.user.get()?.nickname ?? "");
  const displayColor = new Signal(app.user.get()?.displayColor ?? "#ffffff");

  const connectForm = (
    <form
      _tap={onEvent("submit", ev => {
        ev.preventDefault();
        app.user.set({ nickname: nickname.get(), displayColor: displayColor.get() });

        app.connect();
      })}
      id="connect-form"
    >
      <label htmlFor="nickname">nickname</label>
      <input _tap={bindValue(nickname)} id="nickname" placeholder="nickname" required />

      <label htmlFor="display-color">display name color</label>
      <div className="group">
        <input type="color" _tap={bindValue(displayColor)} id="display-color" required />
        {` `}
        <span>
          <strong
            _tap={s => {
              nickname.subscribeImmediate(v => (s.textContent = v));
              displayColor.subscribeImmediate(v => (s.style.color = v));
            }}
          />
          : my message
        </span>
      </div>

      <label htmlFor="session-id">session id</label>
      <input
        _tap={bindValue(app.sessionId)}
        id="session-id"
        placeholder="{random string}"
        required
      />

      <button type="submit">join</button>
    </form>
  );

  return connectForm;
};
