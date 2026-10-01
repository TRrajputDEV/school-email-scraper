import { setTimeout as delay } from "node:timers/promises";

const MIN_INTERVAL_MS = 2_000;

let lastRequestStartedAt = 0;
let requestInFlight = false;

export async function cbseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (requestInFlight) {
    throw new Error(
      "A CBSE request is already in progress. Please try again shortly.",
    );
  }

  requestInFlight = true;

  try {
    const elapsed =
      Date.now() - lastRequestStartedAt;

    const remainingWait =
      MIN_INTERVAL_MS - elapsed;

    if (remainingWait > 0) {
      await delay(remainingWait);
    }

    lastRequestStartedAt = Date.now();

    return await fetch(input, init);
  } finally {
    requestInFlight = false;
  }
}