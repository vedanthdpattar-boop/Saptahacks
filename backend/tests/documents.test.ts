import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src";
import { Repository } from "../src/database/repository";
import { auth, bindings, upload, uploadForm } from "./helpers";

describe("private document API and real D1/R2 bindings", () => {
  it("keeps a 10 MiB PDF and its text intact in private KV without R2", async () => {
    const pdf = new Uint8Array(10 * 1024 * 1024).fill(255);
    pdf.set(new TextEncoder().encode("%PDF-1.7\n"));
    const form = uploadForm();
    form.set("file", new File([pdf], "paper.pdf", { type: "application/pdf" }));
    const b = bindings({ FILES: undefined });
    const response = await app.request(
      "/api/documents",
      { method: "POST", body: form },
      b,
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; accessToken: string };
    const row = (await new Repository(env.DB).document(body.id))!;
    const stored = (await env.FILES_KV.get(row.pdf_key, "arrayBuffer"))!;
    expect(stored.byteLength).toBe(pdf.byteLength);
    expect(
      new Uint8Array(await crypto.subtle.digest("SHA-256", stored)),
    ).toEqual(new Uint8Array(await crypto.subtle.digest("SHA-256", pdf)));
    expect(await env.FILES_KV.get(row.text_key)).toBe(
      form.get("extractedText"),
    );
    expect((await env.FILES.list()).objects).toHaveLength(0);
    expect((await app.request(`/api/documents/${body.id}`, {}, b)).status).toBe(
      401,
    );
    expect(JSON.stringify(body)).not.toMatch(
      /pdf_key|text_key|access_token_hash/,
    );
    pdf[0] = 0;
    form.set(
      "file",
      new File(["%PDF-1.7", pdf], "large.pdf", { type: "application/pdf" }),
    );
    expect(
      (await app.request("/api/documents", { method: "POST", body: form }, b))
        .status,
    ).toBe(413);
    expect((await env.FILES_KV.list()).keys).toHaveLength(2);
  });
  it("cleans up private KV on database failure and a partial KV write", async () => {
    const b = bindings({ FILES: undefined });
    const insert = vi
      .spyOn(Repository.prototype, "insertDocument")
      .mockRejectedValueOnce(new Error("synthetic DB failure"));
    expect(
      (
        await app.request(
          "/api/documents",
          { method: "POST", body: uploadForm() },
          b,
        )
      ).status,
    ).toBe(500);
    expect((await env.FILES_KV.list()).keys).toHaveLength(0);
    insert.mockRestore();
    const kv = {
      put: vi
        .fn()
        .mockImplementationOnce((key: string, value: ArrayBuffer) =>
          env.FILES_KV.put(key, value),
        )
        .mockRejectedValueOnce(new Error("synthetic KV quota failure")),
      delete: vi.fn((key: string) => env.FILES_KV.delete(key)),
    };
    expect(
      (
        await app.request(
          "/api/documents",
          { method: "POST", body: uploadForm() },
          bindings({
            FILES: undefined,
            FILES_KV: kv as unknown as KVNamespace,
          }),
        )
      ).status,
    ).toBe(500);
    expect(kv.delete).toHaveBeenCalledTimes(2);
    expect((await env.FILES_KV.list()).keys).toHaveLength(0);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM documents").first("n"),
    ).toBe(0);
  });
  it("keeps a delayed KV read retryable without sending missing text to AI", async () => {
    const b = bindings({ FILES: undefined });
    const doc = await upload(b);
    const response = await app.request(
      `/api/documents/${doc.id}/extract`,
      { method: "POST", headers: auth(doc.accessToken) },
      {
        ...b,
        FILES_KV: {
          get: vi.fn().mockResolvedValue(null),
        } as unknown as KVNamespace,
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "document_text_missing" },
    });
    expect(b.AI.run).not.toHaveBeenCalled();
    expect(
      (await new Repository(env.DB).document(doc.id))!.lease_token,
    ).toBeNull();
  });
  it("checks database health and sends exact CORS origins", async () => {
    const b = bindings();
    const response = await app.request(
      "/api/health",
      { headers: { Origin: "http://localhost:5173" } },
      b,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", mode: "live" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(
      (
        await app.request(
          "/api/health",
          { headers: { Origin: "https://unconfigured.example" } },
          b,
        )
      ).status,
    ).toBe(403);
    const preflight = await app.request(
      "/api/documents",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Headers": "authorization",
        },
      },
      b,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );
  });
  it("stores private objects and only a hash, and protects document access", async () => {
    const b = bindings();
    const result = await upload(b);
    expect(result.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = (await new Repository(env.DB).document(result.id))!;
    expect(row.access_token_hash).not.toBe(result.accessToken);
    expect(row.access_token_hash).toHaveLength(64);
    expect(await env.FILES.get(row.pdf_key)).not.toBeNull();
    expect(await env.FILES.get(row.text_key)).not.toBeNull();
    expect(
      (await app.request(`/api/documents/${result.id}`, {}, b)).status,
    ).toBe(401);
    expect(
      (
        await app.request(
          `/api/documents/${result.id}`,
          { headers: auth("x".repeat(43)) },
          b,
        )
      ).status,
    ).toBe(401);
    const response = await app.request(
      `/api/documents/${result.id}`,
      { headers: auth(result.accessToken) },
      b,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      id: result.id,
      name: "paper.pdf",
      mode: "live",
    });
    expect(JSON.stringify(body)).not.toMatch(
      /pdf_key|text_key|access_token_hash|accessToken/,
    );
  });
  it.each(["mime", "signature", "text", "pages", "duplicate", "size"])(
    "rejects invalid %s before persistence",
    async (kind) => {
      const b = bindings({ MAX_PDF_BYTES: "1024" });
      const form = uploadForm();
      if (kind === "mime")
        form.set(
          "file",
          new File(["%PDF-1.7"], "paper.pdf", { type: "text/plain" }),
        );
      if (kind === "signature")
        form.set(
          "file",
          new File(["not a PDF"], "paper.pdf", { type: "application/pdf" }),
        );
      if (kind === "text") form.set("extractedText", " ".repeat(50));
      if (kind === "pages") form.set("pageCount", "1.5");
      if (kind === "duplicate") form.append("pageCount", "2");
      if (kind === "size")
        form.set(
          "file",
          new File(["%PDF-1.7", "x".repeat(1024)], "paper.pdf", {
            type: "application/pdf",
          }),
        );
      const response = await app.request(
        "/api/documents",
        { method: "POST", body: form },
        b,
      );
      expect(response.status).toBe(kind === "size" ? 413 : 400);
      expect((await env.FILES.list()).objects).toHaveLength(0);
      expect(
        await env.DB.prepare("SELECT count(*) AS n FROM documents").first("n"),
      ).toBe(0);
    },
  );
  it("cleans up both objects on database failure and partial storage failure", async () => {
    const b = bindings();
    const insert = vi
      .spyOn(Repository.prototype, "insertDocument")
      .mockRejectedValueOnce(new Error("synthetic DB failure"));
    expect(
      (
        await app.request(
          "/api/documents",
          { method: "POST", body: uploadForm() },
          b,
        )
      ).status,
    ).toBe(500);
    expect((await env.FILES.list()).objects).toHaveLength(0);
    insert.mockRestore();
    const failingFiles = {
      put: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("synthetic R2 failure")),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    expect(
      (
        await app.request(
          "/api/documents",
          { method: "POST", body: uploadForm() },
          bindings({ FILES: failingFiles as unknown as R2Bucket }),
        )
      ).status,
    ).toBe(500);
    expect(failingFiles.delete).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringMatching(/original\.pdf$/),
        expect.stringMatching(/text\.txt$/),
      ]),
    );
  });
  it("uses shared rate limiting and prevents overlapping document mutations", async () => {
    const limited = bindings({
      API_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: false }),
      },
    });
    expect(
      (
        await app.request(
          "/api/documents",
          { method: "POST", body: uploadForm() },
          limited,
        )
      ).status,
    ).toBe(429);
    const doc = await upload();
    const repo = new Repository(env.DB);
    const token = await repo.acquireLease(doc.id);
    await expect(repo.acquireLease(doc.id)).rejects.toMatchObject({
      code: "document_busy",
    });
    await repo.releaseLease(doc.id, token);
    await expect(repo.acquireLease(doc.id)).resolves.toBeTypeOf("string");
  });
});
