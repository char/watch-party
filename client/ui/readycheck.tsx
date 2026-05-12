import { ClientPeer } from "../state/connection.ts";
import { onEvent } from "../util.ts";

export type ReadyCheckVote = "yes" | "no" | "abstain";

export interface ReadyCheckAudio {
  started: HTMLAudioElement;
  yes: HTMLAudioElement;
  no: HTMLAudioElement;
}

// `started` is preloaded eagerly so it plays without latency on packet arrival;
// vote sounds are deferred until a check actually starts (see preloadVoteSounds).
export function createReadyCheckAudio(): ReadyCheckAudio {
  const audio = {
    started: new Audio("/assets/readycheck-started.flac"),
    yes: new Audio("/assets/readycheck-yes.flac"),
    no: new Audio("/assets/readycheck-no.flac"),
  };
  audio.started.load();
  return audio;
}

export function preloadVoteSounds(audio: ReadyCheckAudio) {
  audio.yes.load();
  audio.no.load();
}

export function playReadyCheckSound(audio: HTMLAudioElement) {
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

interface EmbedOptions {
  voteId: string;
  initiator: ClientPeer;
  participants: ClientPeer[];
  endsAt: number;
  selfId: string;
  amInitiator: boolean;
  onVote: (vote: "yes" | "no") => void;
  onEndEarly: () => void;
}

const VOTE_GLYPH: Record<ReadyCheckVote | "pending", string> = {
  yes: "y",
  no: "n",
  abstain: "-",
  pending: "⋯",
};

export class ReadyCheckEmbed {
  readonly elem: Element;
  readonly voteId: string;

  #votes = new Map<string, ReadyCheckVote>();
  #peerItems = new Map<string, Element>();
  #completed = false;
  #selfVoted = false;
  #managementToken: string | undefined;

  #countdownEl: Element;
  #countdownTimer: number;
  #buttons: Element;
  #yesBtn: HTMLButtonElement;
  #noBtn: HTMLButtonElement;
  #endEarlyBtn: HTMLButtonElement | undefined;

  constructor(private opts: EmbedOptions) {
    this.voteId = opts.voteId;

    this.#yesBtn = (
      <button type="button" class="yes" _also={onEvent("click", () => this.vote("yes"))}>
        yes
      </button>
    ) as HTMLButtonElement;
    this.#noBtn = (
      <button type="button" class="no" _also={onEvent("click", () => this.vote("no"))}>
        no
      </button>
    ) as HTMLButtonElement;
    this.#buttons = (
      <div class="buttons">
        {this.#yesBtn}
        {this.#noBtn}
      </div>
    );
    if (opts.amInitiator) {
      this.#endEarlyBtn = (
        <button
          type="button"
          class="end-early"
          _also={onEvent("click", () => this.opts.onEndEarly())}
        >
          end early
        </button>
      ) as HTMLButtonElement;
      this.#buttons.append(this.#endEarlyBtn);
    }

    const peerList = <ul class="readycheck-peers" />;
    for (const peer of opts.participants) {
      const item = (
        <li class="peer pending" dataset={{ peer: peer.connectionId }}>
          <span class="status">{VOTE_GLYPH.pending}</span>
          <strong style={{ color: peer.displayColor }}>{peer.nickname}</strong>
        </li>
      );
      this.#peerItems.set(peer.connectionId, item);
      peerList.append(item);
    }

    this.#countdownEl = <span class="countdown" />;
    this.#updateCountdown();
    this.#countdownTimer = setInterval(() => this.#updateCountdown(), 500);

    this.elem = (
      <article class="readycheck" dataset={{ voteId: opts.voteId }}>
        <header>
          <strong style={{ color: opts.initiator.displayColor }}>
            {opts.initiator.nickname}
          </strong>{" "}
          started a ready check {this.#countdownEl}
        </header>
        {peerList}
        {this.#buttons}
      </article>
    );
  }

  #updateCountdown() {
    if (this.#completed) return;
    const remaining = Math.max(0, Math.ceil((this.opts.endsAt - Date.now()) / 1000));
    this.#countdownEl.textContent = `(${remaining}s)`;
  }

  vote(vote: "yes" | "no") {
    if (this.#completed || this.#selfVoted) return;
    this.#selfVoted = true;
    this.#yesBtn.disabled = true;
    this.#noBtn.disabled = true;
    this.opts.onVote(vote);
  }

  setManagementToken(token: string) {
    this.#managementToken = token;
  }
  get managementToken(): string | undefined {
    return this.#managementToken;
  }

  recordVote(peerId: string, vote: ReadyCheckVote) {
    if (this.#votes.has(peerId)) return;
    this.#votes.set(peerId, vote);

    const item = this.#peerItems.get(peerId);
    if (item) {
      item.classList.remove("pending");
      item.classList.add(vote);
      const status = item.querySelector(".status");
      if (status) status.textContent = VOTE_GLYPH[vote];
    }

    if (peerId === this.opts.selfId) {
      this.#selfVoted = true;
      this.#yesBtn.disabled = true;
      this.#noBtn.disabled = true;
    }
  }

  complete() {
    if (this.#completed) return;
    this.#completed = true;
    clearInterval(this.#countdownTimer);

    this.#countdownEl.textContent = "(complete)";
    this.#yesBtn.disabled = true;
    this.#noBtn.disabled = true;
    if (this.#endEarlyBtn) this.#endEarlyBtn.disabled = true;
    this.elem.classList.add("complete");

    for (const [peerId, item] of this.#peerItems) {
      if (this.#votes.has(peerId)) continue;
      item.classList.remove("pending");
      item.classList.add("abstain");
      const status = item.querySelector(".status");
      if (status) status.textContent = VOTE_GLYPH.abstain;
    }
  }
}
