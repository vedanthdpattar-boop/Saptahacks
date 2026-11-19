import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfExtraction } from "../types";
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export function validatePdf(file: Pick<File, "name" | "size" | "type">) {
  if (
    !/\.pdf$/i.test(file.name) ||
    (file.type &&
      !["application/pdf", "application/octet-stream"].includes(file.type))
  )
    throw new Error("Choose a PDF file ending in .pdf.");
  if (!file.size)
    throw new Error("This file is empty. Choose a text-based PDF.");
  if (file.size > MAX_PDF_BYTES)
    throw new Error(
      "This PDF exceeds the 10 MB limit. Choose a smaller document.",
    );
}
export async function extractPdf(
  file: File,
  progress: (value: number) => void,
  signal?: AbortSignal,
): Promise<PdfExtraction> {
  validatePdf(file);
  const data = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted)
    throw new DOMException("Extraction cancelled", "AbortError");
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes("%PDF-"))
    throw new Error("The file does not contain a valid PDF header.");
  const { getDocument, GlobalWorkerOptions, PasswordResponses } =
    await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = workerUrl;
  if (signal?.aborted)
    throw new DOMException("Extraction cancelled", "AbortError");
  const root = `${import.meta.env.BASE_URL}pdfjs/`;
  const task = getDocument({
    data,
    cMapUrl: `${root}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${root}standard_fonts/`,
    wasmUrl: `${root}wasm/`,
  });
  const cancel = () => {
    void task.destroy();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      if (signal?.aborted)
        throw new DOMException("Extraction cancelled", "AbortError");
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join("")
          .trim(),
      );
      page.cleanup();
      progress(Math.round((pageNumber / pdf.numPages) * 100));
    }
    return { text: pages.join("\n\n"), pageCount: pdf.numPages };
  } catch (error) {
    if (signal?.aborted)
      throw new DOMException("Extraction cancelled", "AbortError");
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === PasswordResponses.NEED_PASSWORD ||
        error.code === PasswordResponses.INCORRECT_PASSWORD)
    )
      throw new Error(
        "This PDF is password-protected. Upload an unlocked copy.",
      );
    throw new Error(
      "The PDF could not be read. It may be damaged or password-protected. Try exporting an unlocked text-based copy.",
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
