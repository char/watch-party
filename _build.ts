import { build } from "@char/aftercare/bundle";

if (import.meta.main) {
  const watch = Deno.args.includes("--watch");
  await build({
    in: ["./client/main.ts", "./client/main-create.ts"],
    outDir: "./web/dist",
    watch,
    overrides: { loader: { ".wasm": "file" }, splitting: true },
  });
}
