import "../common/pipe.ts";

import * as j from "@char/justin";
import { Application, HttpError, Router, Status } from "@oak/oak";

import { PlaylistItemSchema } from "../common/playlist.ts";
import { handleConnection, SessionConnection } from "./connection.ts";
import { WatchSession } from "./session.ts";
import { apiHandler } from "./util/api.ts";
import { randomBase32 } from "./util/base32.ts";

const router = new Router();

export class HTTPError extends Error {
  constructor(
    public status: Status,
    message: string,
  ) {
    super(message);
  }
}

router.get("/api/session/:session/connect", ctx => {
  const session = WatchSession.SESSIONS.get(ctx.params.session);
  if (!session) {
    throw new HTTPError(Status.NotFound, "no session found with given ID");
  }

  const resumptionToken = ctx.request.url.searchParams.get("resume") ?? undefined;

  let connection: SessionConnection;
  if (resumptionToken) {
    const maybeConnection = session.connections.find(
      it => it.resumptionToken === resumptionToken,
    );
    if (maybeConnection === undefined)
      throw new HTTPError(Status.Forbidden, "invalid session resumption token");
    connection = maybeConnection;
  } else {
    const nickname = ctx.request.url.searchParams.get("nickname");
    if (!nickname) throw new HTTPError(Status.BadRequest, "missing nickname");

    const displayColor = ctx.request.url.searchParams.get("color");
    if (!displayColor) throw new HTTPError(Status.BadRequest, "missing color");

    const connectionId = randomBase32(8);
    connection = {
      id: connectionId,
      peer: {
        connectionId,
        nickname,
        displayColor,
      },
      lastKeepalive: Date.now(),
      resumptionToken: randomBase32(16),
      sockets: new Set(),
    };

    session.addPeer(connection);
  }

  handleConnection(session, connection, ctx.upgrade());
});

router.put(
  "/api/session",
  apiHandler(
    {
      body: j.obj({
        id: j.string.$pipe(j.optional),
        playlist: PlaylistItemSchema.$pipe(j.array).$pipe(j.optional),
      }),
    },
    (_ctx, { body }) => {
      let id = body.id || randomBase32(16);
      while (WatchSession.SESSIONS.has(id)) id = randomBase32(16);
      const session = new WatchSession(id);
      if (body.playlist) session.playlist = body.playlist;
      if (session.playlist.length) session.playlistIndex = 0;
      return session.info();
    },
  ),
);

router.get("/:path*", async ctx => {
  try {
    await ctx.send({
      root: "./web",
      index: "index.html",
    });
  } catch (err) {
    if (err instanceof HttpError) {
      ctx.response.status = err.status;
      ctx.response.body = err.stack ?? err.message;
    } else throw err;
  }
});

const app = new Application();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err instanceof HTTPError) {
      ctx.response.status = err.status;
      ctx.response.body = err.message;
      ctx.response.type = "text/plain";
    } else throw err;
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

const bindHost = Deno.env.get("BIND_HOST");
console.log(`Listening on: http://${bindHost ?? "127.0.0.1"}:8524/ ...`);
app.listen({ hostname: bindHost ?? "0.0.0.0", port: 8524 });
