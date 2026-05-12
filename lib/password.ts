import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const SCHEME = "pbkdf2-sha256";
const ITERATIONS = 210_000;
const KEY_LEN = 32;
const SALT_LEN = 16;

export function hashPassword(plain: string): string {
  const normalized = plain.normalize("NFKC");
  const salt = randomBytes(SALT_LEN);
  const hash = pbkdf2Sync(normalized, salt, ITERATIONS, KEY_LEN, "sha256");
  return `${SCHEME}$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(stored: string, plain: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [scheme, iterStr, saltB64, hashB64] = parts;
  if (scheme !== SCHEME) return false;
  const iter = Number(iterStr);
  if (!Number.isFinite(iter) || iter < 1000) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const got = pbkdf2Sync(plain.normalize("NFKC"), salt, iter, expected.length, "sha256");
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

const DUMMY_HASH = hashPassword("dummy-prevent-timing-leak-do-not-use");

export function verifyDummy(plain: string): boolean {
  verifyPassword(DUMMY_HASH, plain);
  return false;
}

const WORDS = [
  "fox", "moss", "pine", "wave", "rain", "fern", "dawn", "moon", "star", "leaf",
  "bird", "wind", "rock", "snow", "lake", "dew", "mint", "sage", "fig", "plum",
];

export function randomPasswordHumanFriendly(): string {
  const w1 = WORDS[Math.floor((randomBytes(1)[0] / 256) * WORDS.length)];
  const w2 = WORDS[Math.floor((randomBytes(1)[0] / 256) * WORDS.length)];
  const n = String(randomBytes(2).readUInt16BE(0) % 100).padStart(2, "0");
  return `${w1}-${w2}-${n}`;
}
