import { decodeCBOR, encodeCBOR } from "@char/cbor";
import { Signal } from "@char/aftercare";
import { validateServerPacket } from "../common/protocol.ts";
import { RoomState } from "../common/room-state.ts";
import type { ClientCommand, Peer, RoomEvent, ServerPacket } from "../common/model.ts";

export type ConnectionStatus = "connected" | "reconnecting" | "closed";

export interface ConnectOptions {
  roomId: string;
  nickname: string;
  displayColor: string;
}

type Identity = { resumeToken: string } | { nickname: string; displayColor: string };
type HelloPacket = ServerPacket & { type: "hello" };

interface Connection {
  socket: WebSocket;
  hello: HelloPacket;
  serverOffsetMs: number;
}

class ConnectionRejectedError extends Error {}

export class Session {
  readonly status = new Signal<ConnectionStatus>("connected");
  readonly editToken = new Signal<string | undefined>(undefined);

  #room!: RoomState;
  #self!: Peer;
  #socket!: WebSocket;
  #serverOffsetMs = 0;
  #resumeToken = "";
  #eventListeners = new Set<(event: RoomEvent) => void>();
  #lifetime = new AbortController();
  #socketListeners: AbortController | undefined;
  #reconnectTask: Promise<void> | undefined;

  constructor(
    readonly roomId: string,
    connection: Connection,
  ) {
    this.#adopt(connection);
  }

  get room(): RoomState {
    return this.#room;
  }

  get self(): Peer {
    return this.#self;
  }

  serverNow(): number {
    return Date.now() + this.#serverOffsetMs;
  }

  send(command: ClientCommand) {
    if (this.#socket.readyState !== WebSocket.OPEN) return;
    this.#socket.send(encodeCBOR(command));
  }

  onEvent(listener: (event: RoomEvent) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  close() {
    if (this.#lifetime.signal.aborted) return;
    this.#lifetime.abort();
    this.#socketListeners?.abort();
    this.#socket.close();
    this.status.set("closed");
  }

  leave() {
    this.send({ type: "peer/leave" });
    this.close();
  }

  #adopt({ socket, hello, serverOffsetMs }: Connection) {
    this.#socketListeners?.abort();
    this.#socket = socket;
    this.#self = hello.self;
    this.#resumeToken = hello.resumeToken;
    this.#serverOffsetMs = serverOffsetMs;
    this.#attach(socket);
    if (this.#room) this.#room.reset(hello.snapshot);
    else this.#room = new RoomState(hello.snapshot);
    this.status.set("connected");
  }

  #attach(socket: WebSocket) {
    const listeners = new AbortController();
    this.#socketListeners = listeners;

    socket.addEventListener(
      "message",
      event => {
        if (socket !== this.#socket || !(event.data instanceof ArrayBuffer)) return;
        const packet = decodePacket(event.data);
        if (packet?.type !== "event") return;

        this.#serverOffsetMs = smoothOffset(
          this.#serverOffsetMs,
          packet.serverTimeMs - Date.now(),
        );
        this.#room.apply(packet.event);
        for (const listener of this.#eventListeners) listener(packet.event);
      },
      { signal: listeners.signal },
    );

    const disconnected = () => this.#disconnect(socket);
    socket.addEventListener("close", disconnected, { signal: listeners.signal });
    socket.addEventListener("error", disconnected, { signal: listeners.signal });
  }

  #disconnect(socket: WebSocket) {
    if (socket !== this.#socket || this.#lifetime.signal.aborted || this.#reconnectTask) return;

    this.#socketListeners?.abort();
    socket.close();
    this.status.set("reconnecting");
    this.#reconnectTask = this.#reconnect();
  }

  async #reconnect() {
    let delay = 500;
    const signal = this.#lifetime.signal;

    while (!signal.aborted) {
      try {
        await wait(delay, signal);
        const connection = await openConnection(
          this.roomId,
          { resumeToken: this.#resumeToken },
          signal,
        );
        this.#adopt(connection);
        this.#reconnectTask = undefined;
        return;
      } catch (err) {
        if (signal.aborted) break;
        console.warn(err);
        if (err instanceof ConnectionRejectedError) {
          this.close();
          break;
        }
        delay = Math.min(delay * 2, 5_000);
      }
    }

    this.#reconnectTask = undefined;
  }
}

export async function connectRoom(opts: ConnectOptions): Promise<Session> {
  const connection = await openConnection(opts.roomId, {
    nickname: opts.nickname,
    displayColor: opts.displayColor,
  });
  return new Session(opts.roomId, connection);
}

function openConnection(
  roomId: string,
  identity: Identity,
  signal?: AbortSignal,
): Promise<Connection> {
  const url = new URL(`/api/room/${roomId}/connect`, location.href);
  if ("resumeToken" in identity) url.searchParams.set("resume", identity.resumeToken);
  else {
    url.searchParams.set("nickname", identity.nickname);
    url.searchParams.set("color", identity.displayColor);
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  const sentAt = Date.now();
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  return new Promise((resolve, reject) => {
    const listeners = new AbortController();

    const fail = (err: unknown) => {
      listeners.abort();
      socket.close();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    socket.addEventListener(
      "message",
      event => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const packet = decodePacket(event.data);
        if (packet?.type === "error") {
          fail(new ConnectionRejectedError(packet.message));
          return;
        }
        if (packet?.type !== "hello") return;

        listeners.abort();
        const receivedAt = Date.now();
        resolve({
          socket,
          hello: packet,
          serverOffsetMs: packet.serverTimeMs - (sentAt + receivedAt) / 2,
        });
      },
      { signal: listeners.signal },
    );
    socket.addEventListener("error", () => fail(new Error("websocket failed")), {
      once: true,
      signal: listeners.signal,
    });
    socket.addEventListener(
      "close",
      event => {
        const ErrorType = event.code === 1008 ? ConnectionRejectedError : Error;
        fail(new ErrorType(event.reason || "websocket closed"));
      },
      { once: true, signal: listeners.signal },
    );
    signal?.addEventListener("abort", () => fail(signal.reason), {
      once: true,
      signal: listeners.signal,
    });
    if (signal?.aborted) fail(signal.reason);
  });
}

function decodePacket(data: ArrayBuffer): ServerPacket | undefined {
  let decoded: unknown;
  try {
    decoded = decodeCBOR(new Uint8Array(data));
  } catch {
    return undefined;
  }
  const { value, errors } = validateServerPacket(decoded);
  if (errors) return undefined;
  return value;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

function smoothOffset(current: number, observed: number): number {
  return current * 0.9 + observed * 0.1;
}
