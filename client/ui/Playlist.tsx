import type { Peer, PlaylistItem } from "../../common/model.ts";
import type { Session } from "../session.ts";
import { PlaylistForm } from "./playlist-form.tsx";

export function PlaylistDialog(session: Session) {
  const list = <div />;
  const dialog = (
    <dialog class="playlist-management" closedBy="any">
      <h1>playlist</h1>
      {list}
      <details>
        <summary>
          <h2>add new item</h2>
        </summary>
        <PlaylistForm
          submitLabel="append"
          onSubmit={item =>
            session.send({
              type: "playlist/append",
              item,
            })
          }
        />
      </details>
    </dialog>
  ) as HTMLDialogElement;

  const render = () => {
    list.textContent = "";
    const peers = session.room.peerProfiles;
    const current = session.room.currentItemId;
    for (const item of session.room.playlist) {
      list.append(renderItem(session, item, peers, item.id === current));
    }
  };
  render();
  session.onRoomChange((room, previous) => {
    if (
      room.playlist !== previous.playlist ||
      room.currentItemId !== previous.currentItemId ||
      room.peerProfiles !== previous.peerProfiles
    )
      render();
  });

  return dialog;
}

function renderItem(session: Session, item: PlaylistItem, peers: Peer[], active: boolean) {
  const addedBy = item.addedBy ? peers.find(peer => peer.id === item.addedBy) : undefined;
  return (
    <details classList={["playlist-item", active ? "active" : undefined]}>
      <summary>
        <h2>{item.video}</h2>
        {addedBy ? (
          <p>
            added by <span style={{ color: addedBy.displayColor }}>{addedBy.nickname}</span>
          </p>
        ) : (
          ""
        )}
        <section class="controls">
          {active ? (
            ""
          ) : (
            <button
              type="button"
              _onclick={() =>
                session.send({
                  type: "playlist/select",
                  itemId: item.id,
                })
              }
            >
              skip to
            </button>
          )}
          <button
            type="button"
            class="danger"
            _onclick={() =>
              session.send({
                type: "playlist/remove",
                itemId: item.id,
              })
            }
          >
            remove
          </button>
        </section>
      </summary>

      <section class="edit">
        <PlaylistForm
          submitLabel="apply edits"
          initial={item}
          onSubmit={draft =>
            session.send({
              type: "playlist/edit",
              itemId: item.id,
              patch: draft,
            })
          }
        />
      </section>
    </details>
  );
}
