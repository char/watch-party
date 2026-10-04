import { assertEquals } from "@std/assert";
import handler from "./main.ts";

Deno.test("invalid room requests return JSON errors", async () => {
  for (const body of ["null", "{", '{"playlist":"bad"}']) {
    const response = await handler.fetch(
      new Request("http://localhost/api/room", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    assertEquals(response.status, 400);
    assertEquals(await response.json(), { error: "invalid room request" });
  }
});

Deno.test("connecting to an unknown room returns a JSON error", async () => {
  const response = await handler.fetch(
    new Request("http://localhost/api/room/missing/connect"),
  );
  assertEquals(response.status, 404);
  assertEquals(await response.json(), { error: "room not found" });
});

Deno.test("unmatched server routes return not found", async () => {
  const response = await handler.fetch(new Request("http://localhost/missing"));
  assertEquals(response.status, 404);
  await response.body?.cancel();
});
