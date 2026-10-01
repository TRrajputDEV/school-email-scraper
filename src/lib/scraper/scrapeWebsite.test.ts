import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { scrapeWebsite, validatePublicUrl } from "./scrapeWebsite";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("validatePublicUrl", () => {
  it("rejects localhost and loopback addresses", async () => {
    assert.equal(await validatePublicUrl("http://localhost"), undefined);
    assert.equal(await validatePublicUrl("http://127.0.0.1"), undefined);
    assert.equal(await validatePublicUrl("http://[::1]"), undefined);
    assert.equal(await validatePublicUrl("http://[::ffff:127.0.0.1]"), undefined);
  });

  it("rejects private and link-local IPv4 ranges", async () => {
    for (const url of [
      "http://10.0.0.1",
      "http://172.16.0.1",
      "http://192.168.1.1",
      "http://169.254.1.1",
      "http://0.0.0.0",
    ]) {
      assert.equal(await validatePublicUrl(url), undefined, url);
    }
  });

  it("rejects reserved IPv6 ranges and non-http protocols", async () => {
    assert.equal(await validatePublicUrl("http://[fc00::1]"), undefined);
    assert.equal(await validatePublicUrl("http://[fe80::1]"), undefined);
    assert.equal(await validatePublicUrl("ftp://example.com"), undefined);
  });
});

describe("scrapeWebsite security and status handling", () => {
  it("does not fetch rejected private URLs", async () => {
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error("should not fetch");
    };

    const result = await scrapeWebsite("http://127.0.0.1:8080");

    assert.equal(result.status, "failed");
    assert.equal(fetchCalled, false);
  });

  it("rejects a redirect to another hostname", async () => {
    globalThis.fetch = async () => new Response(null, {
      status: 302,
      headers: { location: "https://redirected.example/contact" },
    });

    const result = await scrapeWebsite("https://example.com");

    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /hostname is not allowed/);
  });

  it("returns partial when a relevant internal page fails", async () => {
    globalThis.fetch = async (input) => {
      const url = String(input);

      if (url === "https://example.com/") {
        return new Response(
          '<a href="/contact">Contact</a><p>office@example.com</p>',
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }

      return new Response("unavailable", { status: 503 });
    };

    const result = await scrapeWebsite("https://example.com");

    assert.equal(result.status, "partial");
    assert.deepEqual(result.emails, [
      { email: "office@example.com", sourcePage: "https://example.com/" },
    ]);
    assert.match(result.error ?? "", /1 relevant page/);
  });
});
