import { LazySignal, Signal } from "@char/aftercare";
import { connectToSession, SessionConnection } from "../state/connection.ts";

export interface UserInfo {
  nickname: string;
  displayColor: string;
}

let connecting = false;

export const app = {
  locked: new Signal(false),

  user: new Signal<UserInfo | undefined>(undefined).tap(s => {
    const nickname = localStorage.getItem("watch-party/last-nickname") ?? undefined;
    const displayColor = localStorage.getItem("watch-party/last-display-color") ?? "#ffffff";
    if (nickname) s.set({ nickname, displayColor });

    s.subscribe(u => {
      if (!u) return;
      localStorage.setItem("watch-party/last-nickname", u.nickname);
      localStorage.setItem("watch-party/last-display-color", u.displayColor);
    });
  }),

  connection: new LazySignal<SessionConnection>(),
  connect: async () => {
    const session = app.sessionId.get();
    if (!session) return;

    const user = app.user.get();
    if (!user) return;

    if (connecting) return;
    try {
      connecting = true;
      const connection = await connectToSession(user, session);

      const existingConnection = app.connection.get();
      if (existingConnection) existingConnection.dispose();

      app.connection.set(connection);
    } finally {
      connecting = false;
    }
  },

  sessionId: new Signal<string>(window.location.hash.substring(1)).tap(s => {
    let skip = false;
    s.subscribe(id => {
      skip = true;
      window.location.replace("#" + id.toString());
      skip = false;
    });
    window.addEventListener("hashchange", () => {
      if (skip) return;
      s.set(window.location.hash.substring(1));
    });
  }),
};

Object.defineProperty(globalThis, "app", { value: app });
Object.defineProperty(globalThis, "connection", { get: () => app.connection.get() });
Object.defineProperty(globalThis, "session", { get: () => app.connection.get()?.session });
