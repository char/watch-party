const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function randomId(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte & 31];
  return out;
}
