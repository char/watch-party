import { build } from "@char/aftercare/esbuild";

if (import.meta.main) {
  const watch = Deno.args.includes("--watch");
  await build({
    in: ["./client/main.ts"],
    outDir: "./web/dist",
    watch,
    extraOptions: { loader: { ".wasm": "file" }, splitting: true, minify: false },
  });
}
