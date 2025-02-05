import { Signal } from "@char/aftercare";
import { app } from "./app.ts";
import { bindValue, onEvent } from "./util.ts";

export type ConnectCallback = (sessionId: string, nickname: string) => void;

export const createConnectForm = () => {
  const nickname = new Signal(app.user.get()?.nickname ?? "");
  const displayColor = new Signal(app.user.get()?.displayColor ?? "#ffffff");

  return (
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

      <button role="submit">join</button>

      <p>
        don't have a session id? you might want to{" "}
        <a
          _tap={onEvent("click", e => {
            e.preventDefault();
            // TODO: show create session form
          })}
          href="javascript:void(0)"
        >
          create a session
        </a>
        .
      </p>
    </form>
  );
};
