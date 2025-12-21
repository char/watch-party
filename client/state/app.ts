import { LazySignal, Signal } from "@char/aftercare";
import {
  connectToSession,
  reconnectToSession,
  SessionConnection,
} from "../state/connection.ts";
import { PlaylistManagement } from "../ui/playlist-management.tsx";
import { LostConnection, Reconnected } from "./video-state.ts";

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

  session: new LazySignal<SessionConnection>(),
  connect: async () => {
    const sessionId = app.sessionId.get();
    if (!sessionId) return;

    const user = app.user.get();
    if (!user) return;

    if (connecting) return;
    try {
      connecting = true;
      let session = await connectToSession(user, sessionId);
      const existingSession = app.session.get();
      if (existingSession) existingSession.dispose();
      app.session.set(session);

      const tryReconnect = async () => {
        if (session.abort.aborted) return;

        try {
          session = await reconnectToSession(sessionId, session.resumptionToken);
          // console.log("reconnected!");
          const existingSession = app.session.get();
          if (existingSession) existingSession.dispose();
          app.session.set(session);

          session.video.fire(Reconnected);
          session.socket.addEventListener("error", tryReconnect);
          session.socket.addEventListener("close", tryReconnect);
        } catch (err) {
          console.warn(err);
          // TODO: failed to reconnect. what do?
          session.video.fire(LostConnection);
        }
      };
      session.socket.addEventListener("error", tryReconnect);
      session.socket.addEventListener("close", tryReconnect);
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

  management: new LazySignal<PlaylistManagement>(),
};

app.session.subscribe(session => {
  app.management.get()?.elem?.remove();
  app.management.set(new PlaylistManagement(session));
});

Object.defineProperty(globalThis, "app", { value: app });
Object.defineProperty(globalThis, "session", { get: () => app.session.get() });
