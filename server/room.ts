import { decodeCBOR, encodeCBOR } from "@char/cbor";
import { randomId } from "../common/id.ts";
import {
  activeReadyCheck,
  emptyRoomState,
  playheadAt,
  systemMessage,
  type ClientCommand,
  type NewPlaylistItem,
  type Peer,
  type RoomConfig,
  type RoomEvent,
  type RoomState,
  type ServerPacket,
} from "../common/model.ts";
import { validateClientCommand } from "../common/protocol.ts";
import { resolveRoomState } from "../common/room-state.ts";

interface Client {
  peer: Peer;
  resumeToken: string;
  sockets: Set<WebSocket>;
  abort: AbortController;
  lastSeen: number;
}

export class Room {
  static rooms = new Map<string, Room>();

  #clients = new Map<string, Client>();
  #state: RoomState;
  #editToken = randomId(24);
  #readyCheckTimer: ReturnType<typeof setTimeout> | undefined;
  #timeoutTimer: ReturnType<typeof setInterval>;

  constructor(
    readonly id: string,
    initialPlaylist: NewPlaylistItem[] = [],
    config: RoomConfig = {},
  ) {
    const playlist = initialPlaylist.map(item => ({ ...item, id: randomId(12) }));
    this.#state = {
      ...emptyRoomState(id, Date.now()),
      playlist,
      currentItemId: playlist[0]?.id,
      config,
    };
    this.#timeoutTimer = setInterval(() => this.#dropTimedOutPeers(), 1000);
    Room.rooms.set(id, this);
  }

  get editToken(): string {
    return this.#editToken;
  }

  connect(
    socket: WebSocket,
    identity: { resumeToken: string } | { nickname: string; displayColor: string },
  ) {
    socket.binaryType = "arraybuffer";

    const client =
      "resumeToken" in identity
        ? [...this.#clients.values()].find(it => it.resumeToken === identity.resumeToken)
        : this.#createClient(identity.nickname, identity.displayColor);

    if (!client) {
      socket.close(1008, "invalid resume token");
      return;
    }

    client.sockets.add(socket);
    client.lastSeen = Date.now();

    this.#send(socket, {
      type: "hello",
      self: client.peer,
      resumeToken: client.resumeToken,
      snapshot: this.#state,
      serverTimeMs: Date.now(),
    });

    socket.addEventListener(
      "message",
      event => {
        if (event.data instanceof ArrayBuffer) {
          client.lastSeen = Date.now();
          this.#handleFrame(client.peer.id, new Uint8Array(event.data));
        }
      },
      { signal: client.abort.signal },
    );

    const disconnected = () => {
      if (client.sockets.delete(socket) && !client.sockets.size) client.lastSeen = Date.now();
    };
    socket.addEventListener("close", disconnected, { signal: client.abort.signal });
    socket.addEventListener("error", disconnected, { signal: client.abort.signal });
  }

  #handleCommand(peerId: string, command: ClientCommand) {
    if (!this.#clients.has(peerId)) return;
    for (const event of this.#decide(peerId, command)) this.#apply(event);
  }

  #handleFrame(peerId: string, frame: Uint8Array) {
    let data: unknown;
    try {
      data = decodeCBOR(frame);
    } catch {
      return;
    }

    const { value, errors } = validateClientCommand(data);
    if (errors || !value) return;
    this.#handleCommand(peerId, value);
  }

  #createClient(nickname: string, displayColor: string): Client {
    const id = randomId(8);
    const client = {
      peer: { id, nickname, displayColor },
      resumeToken: randomId(18),
      sockets: new Set<WebSocket>(),
      abort: new AbortController(),
      lastSeen: Date.now(),
    };
    this.#clients.set(id, client);
    this.#apply({ type: "peer/joined", peer: client.peer });
    this.#apply({
      type: "chat/message-added",
      message: systemMessage(randomId(12), "joined", client.peer.id),
    });
    return client;
  }

  #decide(peerId: string, command: ClientCommand): RoomEvent[] {
    switch (command.type) {
      case "peer/leave": {
        const peer = this.#clients.get(peerId)?.peer;
        return [
          { type: "peer/left", peerId, reason: "disconnect" },
          ...(peer
            ? [
                {
                  type: "chat/message-added",
                  message: systemMessage(randomId(12), "left", peer.id),
                } as const,
              ]
            : []),
        ];
      }

      case "chat/send": {
        const text = command.text.trimEnd();
        if (!text.trim()) return [];
        return [
          {
            type: "chat/message-added",
            message: {
              type: "chat",
              id: randomId(12),
              from: peerId,
              text,
              facets: command.facets,
              timestamp: Date.now(),
            },
          },
        ];
      }

      case "playback/set":
        return [
          {
            type: "playback/changed",
            by: peerId,
            playback: {
              positionMs: command.positionMs,
              paused: command.paused,
              updatedAtServerMs: Date.now(),
            },
          },
        ];

      case "playback/request-sync":
        return [
          {
            type: "playback/changed",
            playback: {
              positionMs: playheadAt(this.#state.playback, Date.now()),
              paused: this.#state.playback.paused,
              updatedAtServerMs: Date.now(),
            },
          },
        ];

      case "playhead/report":
        return [
          {
            type: "peer/playhead-reported",
            peerId,
            positionMs: command.positionMs,
            paused: command.paused,
          },
        ];

      case "playlist/append":
        return [
          {
            type: "playlist/item-added",
            by: peerId,
            item: { ...command.item, id: randomId(12), addedBy: peerId },
          },
        ];

      case "playlist/remove": {
        if (!this.#state.playlist.some(item => item.id === command.itemId)) return [];
        const removedCurrent = this.#state.currentItemId === command.itemId;
        return [
          { type: "playlist/item-removed", by: peerId, itemId: command.itemId },
          ...(removedCurrent
            ? [
                {
                  type: "playback/changed",
                  by: peerId,
                  playback: {
                    positionMs: 0,
                    paused: true,
                    updatedAtServerMs: Date.now(),
                  },
                } as const,
              ]
            : []),
        ];
      }

      case "playlist/edit":
        if (!this.#state.playlist.some(item => item.id === command.itemId)) return [];
        return [
          {
            type: "playlist/item-edited",
            by: peerId,
            itemId: command.itemId,
            patch: command.patch,
          },
        ];

      case "playlist/select":
        if (command.itemId && !this.#state.playlist.some(item => item.id === command.itemId))
          return [];
        return [
          { type: "playlist/selected", by: peerId, itemId: command.itemId },
          {
            type: "playback/changed",
            by: peerId,
            playback: {
              positionMs: 0,
              paused: true,
              updatedAtServerMs: Date.now(),
            },
          },
        ];

      case "ready-check/start": {
        if (activeReadyCheck(this.#state)) return [];
        const timestamp = Date.now();
        return [
          {
            type: "ready-check/started",
            entry: {
              type: "ready-check",
              id: randomId(12),
              initiator: peerId,
              timestamp,
              votes: this.#state.presentPeerIds.map(peerId => ({ peerId })),
              endsAtServerMs: timestamp + 30_000,
              completed: false,
            },
          },
        ];
      }

      case "ready-check/vote": {
        const check = activeReadyCheck(this.#state);
        if (check?.id !== command.checkId) return [];
        if (!check.votes.some(record => record.peerId === peerId && !record.vote)) return [];
        return [
          {
            type: "ready-check/voted",
            checkId: command.checkId,
            peerId,
            vote: command.vote,
          },
        ];
      }

      case "ready-check/end": {
        const check = activeReadyCheck(this.#state);
        if (check?.id !== command.checkId || check.initiator !== peerId) return [];
        return this.#completeReadyCheck(command.checkId);
      }

      case "room/update-config":
        if (command.editToken !== this.#editToken) return [];
        return [{ type: "room/config-updated", config: command.config }];

      case "subtitle-delay/set": {
        if (command.editToken !== this.#editToken) return [];
        const item = this.#state.playlist.find(item => item.id === command.itemId);
        if (
          !item ||
          item.id !== this.#state.currentItemId ||
          !Number.isInteger(command.trackIndex) ||
          command.trackIndex < 0 ||
          command.trackIndex >= item.subtitles.length ||
          !Number.isFinite(command.delayMs)
        ) {
          return [];
        }
        return [
          {
            type: "subtitle-delay/changed",
            by: peerId,
            itemId: command.itemId,
            trackIndex: command.trackIndex,
            delayMs: command.delayMs,
          },
        ];
      }
    }
  }

  #apply(event: RoomEvent) {
    this.#state = resolveRoomState(this.#state, event);

    if (event.type === "peer/left") this.#dropClient(event.peerId);
    if (event.type === "ready-check/started")
      this.#startReadyCheckTimer(event.entry.id, event.entry.endsAtServerMs);
    if (event.type === "ready-check/completed") this.#clearReadyCheckTimer();

    this.#broadcastEvent(event);

    if (
      ((event.type === "ready-check/voted" && event.vote !== "abstain") ||
        event.type === "peer/left") &&
      this.#readyCheckFullyVoted()
    ) {
      const check = activeReadyCheck(this.#state);
      if (check) this.#apply({ type: "ready-check/completed", checkId: check.id });
    }
  }

  #completeReadyCheck(checkId: string): RoomEvent[] {
    const check = activeReadyCheck(this.#state);
    if (check?.id !== checkId) return [];

    const abstentions = check.votes
      .filter(record => !record.vote)
      .map(
        ({ peerId }) =>
          ({
            type: "ready-check/voted",
            checkId,
            peerId,
            vote: "abstain",
          }) as const,
      );
    return [...abstentions, { type: "ready-check/completed", checkId }];
  }

  #startReadyCheckTimer(checkId: string, endsAt: number) {
    this.#clearReadyCheckTimer();
    this.#readyCheckTimer = setTimeout(
      () => {
        for (const event of this.#completeReadyCheck(checkId)) this.#apply(event);
      },
      Math.max(0, endsAt - Date.now()),
    );
  }

  #clearReadyCheckTimer() {
    if (this.#readyCheckTimer !== undefined) clearTimeout(this.#readyCheckTimer);
    this.#readyCheckTimer = undefined;
  }

  #dropClient(peerId: string) {
    const client = this.#clients.get(peerId);
    if (!client) return;

    client.abort.abort();
    for (const socket of client.sockets) {
      try {
        socket.close();
      } catch {}
    }
    client.sockets.clear();
    this.#clients.delete(peerId);
  }

  #dropTimedOutPeers() {
    for (const client of this.#clients.values()) {
      const hasOpenSocket = [...client.sockets].some(
        socket => socket.readyState === WebSocket.OPEN,
      );
      if (!hasOpenSocket && client.lastSeen < Date.now() - 15_000) {
        this.#apply({
          type: "peer/left",
          peerId: client.peer.id,
          reason: "timeout",
        });
        this.#apply({
          type: "chat/message-added",
          message: systemMessage(randomId(12), "left", client.peer.id),
        });
      }
    }
  }

  #readyCheckFullyVoted(): boolean {
    return activeReadyCheck(this.#state)?.votes.every(record => record.vote) ?? false;
  }

  #broadcastEvent(event: RoomEvent) {
    const packet: ServerPacket = {
      type: "event",
      event,
      serverTimeMs: Date.now(),
    };
    const frame = encodeCBOR(packet);
    for (const client of this.#clients.values()) {
      for (const socket of client.sockets) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        try {
          socket.send(frame);
        } catch {
          client.sockets.delete(socket);
        }
      }
    }
  }

  #send(socket: WebSocket, packet: ServerPacket) {
    if (socket.readyState === WebSocket.OPEN) socket.send(encodeCBOR(packet));
    else
      socket.addEventListener("open", () => socket.send(encodeCBOR(packet)), {
        once: true,
      });
  }
}
