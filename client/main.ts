import "https://char.lt/esm/pipe.ts";
import "./polyfills/mod.ts";

import { app } from "./app.ts";
import { createConnectForm } from "./connect.tsx";
import { createPlayer } from "./player.tsx";

const main = document.querySelector("main")!;

const connectForm = createConnectForm();
if (!app.connection.get()) main.append(connectForm);

app.connection.subscribeImmediate(conn => {
  connectForm.remove();
  const player = createPlayer(conn);
  conn.abort.addEventListener("abort", () => {
    player.remove();
  });

  main.append(player);
});
