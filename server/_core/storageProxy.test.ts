import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example/",
    forgeApiKey: "test-key",
  },
}));

import { registerStorageProxy } from "./storageProxy";

describe("registerStorageProxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects the public storage path to a presigned download URL", async () => {
    const app = express();
    registerStorageProxy(app);
    const server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const forgeFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ url: "https://cdn.example/file.png" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", forgeFetch);

    try {
      const address = server.address() as AddressInfo;
      const response = await nativeFetch(
        `http://127.0.0.1:${address.port}/manus-storage/generated/file.png`,
        { redirect: "manual" }
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://cdn.example/file.png"
      );
      expect(forgeFetch).toHaveBeenCalledTimes(1);
      const forgeRequest = new URL(String(forgeFetch.mock.calls[0][0]));
      expect(forgeRequest.pathname).toBe("/v1/storage/presign/get");
      expect(forgeRequest.searchParams.get("path")).toBe("generated/file.png");
      expect(forgeFetch.mock.calls[0][1]?.headers).toEqual({
        Authorization: "Bearer test-key",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  });
});
