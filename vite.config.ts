import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import aftercare from "@char/aftercare/vite";
import { dromi } from "@mary/dromi";

export default defineConfig({
  publicDir: "web",
  cacheDir: ".vite",
  plugins: [
    {
      name: "native-deno-npm",
      apply: "serve",
      applyToEnvironment: environment => environment.name === "ssr",
      // The module runner cannot evaluate CommonJS exposed by the Deno resolver.
      resolveId: {
        order: "pre",
        filter: { id: /^npm:/ },
        handler(id) {
          return { id, external: true };
        },
      },
    },
    deno(),
    aftercare(),
    dromi({ entry: "./server/main.ts", args: ["-A", "--unstable-temporal"] }),
  ],
  server: {
    host: Deno.env.get("BIND_HOST") ?? "0.0.0.0",
    port: Number(Deno.env.get("PORT") ?? 8524),
    strictPort: true,
  },
});
