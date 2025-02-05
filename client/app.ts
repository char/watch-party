import { LazySignal, Signal } from "@char/aftercare";
import { connectToSession, SessionConnection } from "./connection.ts";

export interface UserInfo {
  nickname: string;
  displayColor: string;
}

let connecting = false;

export const app = {
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

  sessionId: new Signal<string>(
    window.location.hash
      .substring(1)
      .pipe(s => new URLSearchParams(s))
      .get("id") ?? "",
  ).tap(s => {
    let skip = false;

    s.subscribe(id => {
      const params = window.location.hash.substring(1).pipe(s => new URLSearchParams(s));
      if (id) params.set("id", id);
      else params.delete("id");

      skip = true;
      window.location.replace("#" + params.toString());
      skip = false;
    });

    window.addEventListener("hashchange", () => {
      if (skip) return;
      const params = window.location.hash.substring(1).pipe(s => new URLSearchParams(s));
      s.set(params.get("id") ?? "");
    });
  }),
};

Object.defineProperty(globalThis, "app", { value: app });
Object.defineProperty(globalThis, "connection", { get: () => app.connection.get() });
Object.defineProperty(globalThis, "session", { get: () => app.connection.get()?.session });
