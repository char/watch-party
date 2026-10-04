import type {} from "vite/client";
import { Application, Router, Status } from "@oak/oak";
import { randomId } from "../common/id.ts";
import { validateCreateRoomRequest } from "../common/protocol.ts";
import { Room } from "./room.ts";

class ApiError extends Error {
  constructor(
    readonly status: Status,
    message: string,
  ) {
    super(message);
  }
}

const router = new Router();

router.put("/api/room", async ctx => {
  const body = await ctx.request.body.json().catch(() => undefined);
  const { value, errors } = validateCreateRoomRequest(body);
  if (errors || !value) throw new ApiError(Status.BadRequest, "invalid room request");

  let id = value.id || randomId(16);
  while (Room.rooms.has(id)) id = randomId(16);

  const room = new Room(id, value.playlist, value.config);
  ctx.response.body = { id, editToken: room.editToken };
});

router.get("/api/room/:room/connect", ctx => {
  const room = Room.rooms.get(ctx.params.room);
  if (!room) throw new ApiError(Status.NotFound, "room not found");

  const resumeToken = ctx.request.url.searchParams.get("resume") ?? undefined;
  const { socket, response } = Deno.upgradeWebSocket(ctx.request.source!);
  ctx.response.with(response);

  if (resumeToken) {
    room.connect(socket, { resumeToken });
    return;
  }

  const nickname = ctx.request.url.searchParams.get("nickname");
  const displayColor = ctx.request.url.searchParams.get("color");
  if (!nickname || !displayColor) {
    socket.close(1008, "missing identity");
    return;
  }

  room.connect(socket, { nickname, displayColor });
});

export const app = new Application();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof ApiError) {
      ctx.response.status = err.status;
      ctx.response.type = "application/json";
      ctx.response.body = { error: err.message };
      return;
    }
    throw err;
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

// Rooms, timers and sockets need a process restart rather than module replacement.
import.meta.hot?.on("vite:beforeFullReload", () => Deno.exit());

export default {
  async fetch(request: Request) {
    return (await app.handle(request)) ?? new Response("not found", { status: 404 });
  },
} satisfies Deno.ServeDefaultExport;
