import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, Download, LoaderCircle, Sparkles } from "lucide-react";
import { PageHeader } from "../components/Common";
import { CitationOrbit } from "../components/CitationOrbit";
import { api, safeSourceUrl } from "../services/api";
import type { CitationStyle, FormattedCitation } from "../types";

export function CitationGeneratorPage() {
  const [params] = useSearchParams();
  const [doi, setDoi] = useState(params.get("doi") ?? "");
  const [style, setStyle] = useState<CitationStyle>("apa");
  const [result, setResult] = useState<FormattedCitation>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setResult(undefined);
    setCopyStatus("");
    try {
      const citation = await api.formatCitation(doi, style, abort.signal);
      if (!abort.signal.aborted) setResult(citation);
    } catch (error) {
      if (!abort.signal.aborted) setError((error as Error).message);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Citation generator"
        description="Turn a paper’s DOI into an APA or IEEE reference using registered publication metadata."
      />
      <div className="citation-studio-layout">
        <form
          className="panel citation-card citation-generator"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <div className="studio-form-heading">
            <span className="eyebrow">Citation studio</span>
            <h2>Start with the source.</h2>
            <p>
              Paste a DOI. Choose your style. Keep the publisher details close.
            </p>
          </div>
          <label htmlFor="citation-doi">Paper DOI or DOI link</label>
          <input
            id="citation-doi"
            required
            maxLength={2048}
            value={doi}
            placeholder="10.1038/nature14539 or https://doi.org/…"
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? "citation-error" : "citation-doi-help"}
            onChange={(event) => {
              setDoi(event.target.value);
              setError("");
              setResult(undefined);
              setCopyStatus("");
            }}
          />
          <button
            type="button"
            className="citation-example"
            disabled={busy}
            onClick={() => {
              setDoi("10.1038/nature14539");
              setResult(undefined);
              setError("");
            }}
          >
            <Sparkles size={14} />
            Try a real DOI: Deep learning
          </button>
          <label htmlFor="citation-style">Citation style</label>
          <select
            id="citation-style"
            value={style}
            disabled={busy}
            onChange={(event) => {
              setStyle(event.target.value as CitationStyle);
              setError("");
              setResult(undefined);
              setCopyStatus("");
            }}
          >
            <option value="apa">APA 7</option>
            <option value="ieee">IEEE</option>
          </select>
          <button className="btn btn-primary" disabled={busy || !doi.trim()}>
            {busy && <LoaderCircle className="spin" size={17} />}
            {busy ? "Looking up publication…" : "Generate citation"}
          </button>
          <p id="citation-doi-help" className="muted small">
            Only the DOI is sent for publication lookup. Formatting a reference
            does not verify a research claim.
          </p>
        </form>
        <CitationOrbit />
      </div>
      {error && (
        <div id="citation-error" className="inline-error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <section
          className="panel citation-card citation-result"
          aria-label="Generated citation"
        >
          <div className="panel-heading">
            <h2>{result.style === "apa" ? "APA 7" : "IEEE"} reference</h2>
            <div className="button-row">
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.text);
                    setCopyStatus("Citation copied.");
                  } catch {
                    setCopyStatus(
                      "Copy was unavailable. Select the citation text and copy it manually.",
                    );
                  }
                }}
              >
                <Copy size={16} />
                Copy citation
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([result.text + "\n"], {
                      type: "text/plain;charset=utf-8",
                    }),
                  );
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `citation-${result.style}.txt`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download size={16} />
                Download text
              </button>
            </div>
          </div>
          <blockquote className="citation-reference">{result.text}</blockquote>
          {copyStatus && <p role="status">{copyStatus}</p>}
          <h3>Publication metadata</h3>
          <p>{result.publication.title}</p>
          <p>
            {result.publication.authors.join(", ") || "Authors not supplied"}
            {result.publication.year ? ` · ${result.publication.year}` : ""}
          </p>
          {safeSourceUrl(result.publication.url) && (
            <a
              className="text-link"
              href={safeSourceUrl(result.publication.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open publisher record
            </a>
          )}
          <ul className="plain-list">
            {result.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
