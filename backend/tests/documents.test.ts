import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { app } from "../src";
import { Repository } from "../src/database/repository";
import { auth, bindings, upload, uploadForm } from "./helpers";

describe("private document API and real D1/R2 bindings", () => {
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
