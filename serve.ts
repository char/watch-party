import handler from "./dist/server/index.mjs";

Deno.serve(
  {
    hostname: Deno.env.get("BIND_HOST") ?? "0.0.0.0",
    port: Number(Deno.env.get("PORT") ?? 8524),
  },
  handler.fetch,
);
