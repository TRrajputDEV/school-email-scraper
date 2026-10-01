import crypto from "node:crypto";

const CBSE_COOKIE_NAME = "cbse-access";
const SESSION_TTL_SECONDS = 60 * 60; // 1 hour

function getAccessCode(): string {
  const code = process.env.CBSE_ACCESS_CODE?.trim();

  if (!code) {
    throw new Error(
      "CBSE_ACCESS_CODE is not configured on the server.",
    );
  }

  return code;
}

export function getCBSECookieName(): string {
  return CBSE_COOKIE_NAME;
}

function signPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getAccessCode())
    .update(payload)
    .digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function verifyCBSEAccessCode(
  input: string,
): boolean {
  const expected = getAccessCode();

  const providedBuffer = Buffer.from(input.trim());
  const expectedBuffer = Buffer.from(expected);

  if (
    providedBuffer.length !== expectedBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    providedBuffer,
    expectedBuffer,
  );
}

export function createCBSESessionToken(): string {
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    SESSION_TTL_SECONDS;

  const payload = `v1.${expiresAt}`;
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

function verifyCBSESessionToken(
  token: string,
): boolean {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return false;
  }

  const [version, expiresAtRaw, signature] = parts;

  if (version !== "v1") {
    return false;
  }

  const expiresAt = Number(expiresAtRaw);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  if (now >= expiresAt) {
    return false;
  }

  const payload = `${version}.${expiresAt}`;
  const expectedSignature = signPayload(payload);

  return safeEqual(
    signature,
    expectedSignature,
  );
}

export function isCBSEAccessGranted(
  request: Request,
): boolean {
  const cookieHeader =
    request.headers.get("cookie") ?? "";

  const cookies = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = cookie.slice(0, separator);
    const value = decodeURIComponent(
      cookie.slice(separator + 1),
    );

    if (name !== CBSE_COOKIE_NAME) {
      continue;
    }

    return verifyCBSESessionToken(value);
  }

  return false;
}

export function getCBSESessionMaxAge(): number {
  return SESSION_TTL_SECONDS;
}