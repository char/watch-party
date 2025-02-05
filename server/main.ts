import "https://char.lt/esm/pipe.ts";

import { Application, HttpError, Router, Status } from "@oak/oak";
import { handleConnection, SessionConnection } from "./connection.ts";
import { WatchSession } from "./sessions.ts";
import { apiHandler } from "./util/api.ts";
import { randomBase32 } from "./util/base32.ts";

import * as v from "@badrap/valita";
import { PlaylistItemSchema } from "../common/playlist.ts";

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

    connection = {
      id: randomBase32(8),
      nickname,
      displayColor,
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
    { body: v.object({ playlist: v.array(PlaylistItemSchema).optional() }) },
    (_ctx, { body }) => {
      const session = new WatchSession(randomBase32(16));
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

router.use(async (ctx, next) => {
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

new WatchSession("test").tap(it => {
  it.playlist = [{ video: "https://umm.gay/tmp/tenet.mp4", subtitles: [] }];
  it.lastPlayhead = 603377;
  // it.playedAt = Temporal.Now.instant();
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Listening on: http://127.0.0.1:8524/ ...");
app.listen({ port: 8524 });
