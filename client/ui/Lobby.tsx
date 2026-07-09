import { Signal } from "@char/aftercare";
import "vanilla-colorful/hex-color-picker.js";
import "vanilla-colorful/hex-input.js";
import type { LocalPrefs } from "../prefs.ts";
import { PlaylistForm } from "./playlist-form.tsx";

export function Lobby(opts: {
  prefs: LocalPrefs;
  initialRoomId: string;
  onJoin(roomId: string, editToken?: string): void;
}) {
  const roomId = new Signal(opts.initialRoomId);
  const createRoomId = new Signal("");
  const nickname = new Signal(opts.prefs.nickname.get());
  const displayColor = new Signal(opts.prefs.displayColor.get());
  const createError = new Signal("");
  const colorDialog = (
    <dialog
      _onclick={(event: MouseEvent) => {
        if (event.target === colorDialog) colorDialog.close();
      }}
    >
      <hex-color-picker
        _also={el => {
          displayColor.subscribeImmediate(value => (el.color = value));
          el.addEventListener("color-changed", (event: CustomEvent<{ value: string }>) => {
            displayColor.set(event.detail.value);
          });
        }}
      />
    </dialog>
  ) as HTMLDialogElement;
  const joinForm = (
    <form
      _onsubmit={(event: SubmitEvent) => {
        event.preventDefault();
        opts.prefs.nickname.set(nickname.get());
        opts.prefs.displayColor.set(displayColor.get());
        opts.onJoin(roomId.get());
      }}
      id="connect-form"
    >
      <label htmlFor="nickname">nickname</label>
      <input id="nickname" value={nickname} placeholder="nickname" required />

      <label>display color</label>
      <div class="group">
        <hex-input
          id="display-color"
          _also={el => {
            el.setAttribute("name", "display-color");
            displayColor.subscribeImmediate(value => (el.color = value));
            el.addEventListener("color-changed", (event: CustomEvent<{ value: string }>) => {
              displayColor.set(event.detail.value);
            });
          }}
        />
        <button
          type="button"
          class="color-swatch"
          _also={button => {
            displayColor.subscribeImmediate(value => {
              button.style.backgroundColor = value;
              button.style.borderColor = value;
            });
            button.addEventListener("click", () => colorDialog.showModal());
          }}
        />
        {colorDialog}
        <span>
          <strong style={{ color: displayColor }}>{nickname}</strong>: my message
        </span>
      </div>

      <label htmlFor="room-id">room id</label>
      <input id="room-id" value={roomId} placeholder="room id" required />

      <button type="submit">join</button>
      <p>
        don't have a room?{" "}
        <a href="javascript:void(0)" _onclick={() => joinForm.replaceWith(createForm)}>
          create one
        </a>
        .
      </p>
    </form>
  );

  const createForm = PlaylistForm({
    id: "create-form",
    before: [
      <label>
        room id <small>(leave blank to generate random)</small>
      </label>,
      <input id="create-room-id" name="room-id" value={createRoomId} placeholder="my-movie" />,
    ],
    submitLabel: "create",
    onSubmit: async item => {
      createError.set("");
      const response = await fetch("/api/room", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: createRoomId.get() || undefined,
          playlist: [item],
        }),
      });
      if (!response.ok) {
        createError.set(await response.text());
        return;
      }
      const info = (await response.json()) as {
        id: string;
        editToken: string;
      };
      roomId.set(info.id);
      opts.prefs.nickname.set(nickname.get());
      opts.prefs.displayColor.set(displayColor.get());
      opts.onJoin(info.id, info.editToken);
    },
  });
  createForm.append(
    <p class="danger">{createError}</p>,
    <p>
      already have a room?{" "}
      <a href="javascript:void(0)" _onclick={() => createForm.replaceWith(joinForm)}>
        join one
      </a>
      .
    </p>,
  );

  return joinForm;
}
