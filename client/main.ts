import "../common/pipe.ts";
import "./polyfills/mod.ts";

import { app } from "./state/app.ts";
import { linkForms } from "./ui/connect-create-link.tsx";
import { createConnectForm } from "./ui/connect.tsx";
import { createCreationForm } from "./ui/create.tsx";
import { createPlayer } from "./ui/player.tsx";

const main = document.querySelector("main")!;

const connectForm = createConnectForm();
const creationForm = createCreationForm(id => {
  app.sessionId.set(id);
  creationForm.remove();
  main.append(connectForm);
});
linkForms(connectForm, creationForm);

if (!app.session.ready()) main.append(connectForm);

app.session.subscribeImmediate(conn => {
  connectForm.remove();
  const player = createPlayer(conn);
  conn.abort.addEventListener("abort", () => {
    player.remove();
  });

  main.append(player);
});

app.management.subscribeImmediate(mgmt => {
  main.append(mgmt.elem);
});
