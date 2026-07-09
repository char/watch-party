import { Signal } from "@char/aftercare";
import { createPrefs } from "./prefs.ts";
import { connectRoom } from "./session.ts";
import { Lobby } from "./ui/Lobby.tsx";
import { RoomScreen } from "./ui/Room.tsx";

const main = document.querySelector("main")!;
const prefs = createPrefs();
const routeRoomId = new Signal(location.hash.slice(1));
const error = new Signal("");

window.addEventListener("hashchange", () => routeRoomId.set(location.hash.slice(1)));

function renderLobby() {
  main.textContent = "";
  if (error.get()) main.append(<p class="danger">{error.get()}</p>);
  main.append(
    Lobby({
      prefs,
      initialRoomId: routeRoomId.get(),
      onJoin: (roomId, editToken) => void join(roomId, editToken),
    }),
  );
}

async function join(roomId: string, editToken?: string) {
  if (!roomId) return;
  error.set("");
  history.replaceState(null, "", `#${roomId}`);
  routeRoomId.set(roomId);

  try {
    const session = await connectRoom({
      roomId,
      nickname: prefs.nickname.get(),
      displayColor: prefs.displayColor.get(),
    });
    session.editToken.set(editToken);
    const room = RoomScreen(session, prefs);
    main.replaceChildren(room);
    const messages = room.querySelector("#chat-messages")!;
    messages.scrollTop = messages.scrollHeight;
    window.addEventListener("beforeunload", () => session.close(), {
      once: true,
    });
  } catch (err) {
    console.error(err);
    error.set(err instanceof Error ? err.message : String(err));
    renderLobby();
  }
}

renderLobby();
