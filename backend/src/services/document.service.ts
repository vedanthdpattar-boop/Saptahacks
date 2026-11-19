import { Repository } from "../database/repository";
import { hashToken } from "../middleware/auth.middleware";
import { ApiError } from "../middleware/error.middleware";
import { documentFields, uploadLimits } from "../schemas/document.schema";
import type { Bindings, DocumentRow } from "../types";

export function documentDTO(row: DocumentRow) {
  return {
    id: row.id,
    name: row.filename,
    size: row.file_size,
    pageCount: row.page_count,
    createdAt: row.created_at,
    status: row.status,
    mode: "live" as const,
    errorMessage: row.error_message,
  };
}
export async function uploadDocument(env: Bindings, form: FormData) {
  for (const key of ["file", "extractedText", "pageCount"]) {
    if (form.getAll(key).length !== 1)
      throw new ApiError(
        400,
        "invalid_upload",
        `Supply exactly one ${key} field.`,
      );
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf")
    throw new ApiError(
      400,
      "invalid_pdf",
      "Upload a file with the application/pdf MIME type.",
    );
  const limits = uploadLimits(env);
  if (!file.size || file.size > limits.pdf)
    throw new ApiError(
      413,
      "pdf_too_large",
      `The PDF must be nonempty and no larger than ${Math.floor(limits.pdf / 1048576)} MB.`,
    );
  const signature = new TextDecoder().decode(
    await file.slice(0, 8).arrayBuffer(),
  );
  if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(signature))
    throw new ApiError(
      400,
      "invalid_pdf_signature",
      "The file does not have a supported PDF signature.",
    );
  const parsed = documentFields.safeParse({
    extractedText: form.get("extractedText"),
    pageCount: form.get("pageCount"),
  });
  if (!parsed.success)
    throw new ApiError(
      400,
      "invalid_document_text",
      "Provide extractedText of at least 40 characters and a pageCount between 1 and 100. Scanned PDFs require OCR before upload.",
    );
  const { extractedText, pageCount } = parsed.data;
  if (extractedText.trim().length < 40 || extractedText.includes("\0"))
    throw new ApiError(
      400,
      "invalid_document_text",
      "Extracted text must contain readable, nonempty text.",
    );
  if (new TextEncoder().encode(extractedText).byteLength > limits.text)
    throw new ApiError(
      413,
      "text_too_large",
      `Extracted text exceeds the ${limits.text}-byte processing limit. Upload a shorter document.`,
    );
  const id = crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const accessToken = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const filename =
    file.name
      .split(/[\\/]/)
      .pop()!
      .normalize("NFC")
      .replace(/[\x00-\x1f\x7f]/g, "_")
      .slice(0, 180) || "document.pdf";
  const row = {
    id,
    filename,
    file_size: file.size,
    page_count: pageCount,
    pdf_key: `documents/${id}/original.pdf`,
    text_key: `documents/${id}/text.txt`,
    access_token_hash: await hashToken(accessToken),
  };
  try {
    await env.FILES.put(row.pdf_key, file.stream(), {
      httpMetadata: { contentType: "application/pdf" },
    });
    await env.FILES.put(row.text_key, extractedText, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    const document = await new Repository(env.DB).insertDocument(row);
    return { ...documentDTO(document), accessToken };
  } catch (error) {
    try {
      await env.FILES.delete([row.pdf_key, row.text_key]);
    } catch {
      console.error(
        JSON.stringify({ code: "upload_cleanup_failed", documentId: id }),
      );
    }
    throw error;
  }
}
