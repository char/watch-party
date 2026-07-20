import type { Peer, ReadyCheckEntry, ReadyCheckVote } from "../../common/model.ts";
import type { Session } from "../session.ts";

const VOTE_GLYPH: Record<ReadyCheckVote | "pending", string> = {
  yes: "y",
  no: "n",
  abstain: "-",
  pending: "⋯",
};

export interface ReadyCheckRender {
  readonly elem: HTMLElement;
  dispose(): void;
}

export function renderReadyCheck(
  session: Session,
  peers: Peer[],
  entry: ReadyCheckEntry,
  onDispose?: () => void,
): ReadyCheckRender {
  const initiator = peers.find(peer => peer.id === entry.initiator);
  const remaining = Math.max(0, Math.ceil((entry.endsAtServerMs - session.serverNow()) / 1000));
  const article = (
    <article
      classList={["readycheck", entry.completed ? "complete" : undefined]}
      dataset={{ checkId: entry.id }}
    >
      <header>
        {initiator ? (
          <strong style={{ color: initiator.displayColor }}>{initiator.nickname}</strong>
        ) : (
          "someone"
        )}{" "}
        started a ready check{" "}
        <span class="countdown">{entry.completed ? "(complete)" : `(${remaining}s)`}</span>
      </header>
      {renderParticipants(peers, entry.votes)}
      {entry.completed ? (
        ""
      ) : (
        <div class="buttons">
          <button type="button" class="yes" _onclick={() => vote(session, entry.id, "yes")}>
            yes
          </button>
          <button type="button" class="no" _onclick={() => vote(session, entry.id, "no")}>
            no
          </button>
          {entry.initiator === session.self.id ? (
            <button
              type="button"
              class="end-early"
              _onclick={() =>
                session.send({
                  type: "ready-check/end",
                  checkId: entry.id,
                })
              }
            >
              end early
            </button>
          ) : (
            ""
          )}
        </div>
      )}
    </article>
  ) as HTMLElement;

  if (entry.completed) return { elem: article, dispose: () => undefined };

  const countdown = article.querySelector(".countdown") as HTMLElement;
  const timer = setInterval(() => {
    countdown.textContent = `(${Math.max(
      0,
      Math.ceil((entry.endsAtServerMs - session.serverNow()) / 1000),
    )}s)`;
  }, 1000);
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    unsubscribe();
    onDispose?.();
  };

  const unsubscribe = session.onEvent(event => {
    if (event.type === "peer/left")
      article.querySelector(`[data-peer="${event.peerId}"]`)?.remove();

    if (event.type === "ready-check/voted" && event.checkId === entry.id) {
      const peer = article.querySelector(`[data-peer="${event.peerId}"]`);
      if (peer) {
        peer.className = `peer ${event.vote}`;
        const status = peer.querySelector(".status");
        if (status) status.textContent = VOTE_GLYPH[event.vote];
      }
      if (event.peerId === session.self.id) {
        for (const button of article.querySelectorAll(".buttons .yes, .buttons .no"))
          (button as HTMLElement).style.display = "none";
      }
    }

    if (event.type === "ready-check/completed" && event.checkId === entry.id) {
      article.classList.add("complete");
      countdown.textContent = "(complete)";
      article.querySelector(".buttons")?.remove();
      dispose();
    }
  });

  return { elem: article, dispose };
}

function renderParticipants(peers: Peer[], votes: { peerId: string; vote?: ReadyCheckVote }[]) {
  return (
    <ul class="readycheck-peers">
      {...votes.map(record => {
        const peer = peers.find(peer => peer.id === record.peerId);
        if (!peer) return "";
        const vote = record.vote ?? "pending";
        return (
          <li classList={["peer", vote]} dataset={{ peer: peer.id }}>
            <span class="status">{VOTE_GLYPH[vote]}</span>
            <strong style={{ color: peer.displayColor }}>{peer.nickname}</strong>
          </li>
        );
      })}
    </ul>
  );
}

function vote(session: Session, checkId: string, vote: "yes" | "no") {
  session.send({
    type: "ready-check/vote",
    checkId,
    vote,
  });
}

export function playReadyCheckAudio(audio: HTMLAudioElement) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}
