// if (!globalThis.URLPattern) await import("npm:urlpattern-polyfill@10.0.0");
if (!globalThis.Promise.withResolvers) await import("./with-resolvers.ts");
