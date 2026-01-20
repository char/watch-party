import { encode as encodeBase32 } from "@mary/base32";

export function randomBase32(byteLength: number): string {
  return new Uint8Array(byteLength).$tap(v => crypto.getRandomValues(v)).$pipe(encodeBase32);
}
