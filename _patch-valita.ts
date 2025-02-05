const VALITA_VERSION = "0.4.2";

const valitaSource = await fetch(
  `https://jsr.io/@badrap/valita/${VALITA_VERSION}/src/index.ts`,
  { headers: { accept: "text/plain" } },
).then(r => r.text());

await Deno.writeTextFile(
  "./vendor/valita.ts",
  valitaSource + "\n" + `export type { AbstractType };`,
);
