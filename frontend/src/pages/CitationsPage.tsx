import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Check, LoaderCircle, Search } from "lucide-react";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ReportTabs,
} from "../components/Common";
import { useReport } from "../hooks/useReport";
import { api, safeSourceUrl } from "../services/api";
import type { Citation } from "../types";

export function CitationsPage() {
  const { id = "" } = useParams();
  const { report, error, retry } = useReport(id);
  const [checked, setChecked] = useState<Record<string, Citation>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [checkError, setCheckError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setChecked({});
    setCheckError("");
    setBusy(false);
    setProgress("");
    setSearch("");
    setFilter("all");
    return () => controller.current?.abort();
  }, [id]);
  const citations = (report?.citations ?? []).map(
    (citation) => checked[citation.id] ?? citation,
  );
  const unchecked = citations.filter(
    (citation) => citation.status === "unchecked",
  );
  const visible = citations.filter(
    (citation) =>
      (filter === "all" || citation.status === filter) &&
      `${citation.key} ${citation.referenceText} ${citation.publication?.title ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function check(items: Citation[]) {
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setCheckError("");
    try {
      for (let index = 0; index < items.length; index++) {
        setProgress(`Checking reference ${index + 1} of ${items.length}`);
        const result = await api.resolveCitation(
          id,
          items[index].id,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        setChecked((previous) => ({ ...previous, [result.id]: result }));
      }
      setProgress("Reference checks finished. Review the details below.");
    } catch (error) {
      if (!abort.signal.aborted) setCheckError((error as Error).message);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!report) return <LoadingState />;
  return (
    <>
      <PageHeader
        title="Citation check"
        description={report.document.name}
        action={
          <button
            className="btn btn-primary"
            disabled={
              busy || !unchecked.length || report.document.mode === "demo"
            }
            onClick={() => void check(unchecked)}
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Check size={17} />
            )}{" "}
            Check unchecked references
          </button>
        }
      />
      <ReportTabs />
      <p className="citation-scope">
        Check whether references identify real publications and whether their
        details agree. A metadata match does not establish that a paper supports
        a claim.
      </p>
      {report.document.mode === "demo" && (
        <p className="warning-note">
          Citation checking requires a document uploaded in live mode; demo
          references are fictional.
        </p>
      )}
      {busy && (
        <button
          className="btn btn-secondary"
          onClick={() => {
            controller.current?.abort();
            setBusy(false);
            setProgress("Checks stopped. Saved results remain available.");
          }}
        >
          Stop checking
        </button>
      )}
      {progress && <p role="status">{progress}</p>}
      {checkError && (
        <div className="inline-error" role="alert">
          {checkError}
        </div>
      )}
      <div className="citation-stat-grid">
        <div className="panel">
          <strong>{citations.length}</strong>
          <span>References extracted</span>
        </div>
        <div className="panel">
          <strong>
            {
              citations.filter((citation) => citation.status === "matched")
                .length
            }
          </strong>
          <span>Metadata matches</span>
        </div>
        <div className="panel">
          <strong>
            {
              citations.filter((citation) => citation.status === "needs_review")
                .length
            }
          </strong>
          <span>Need review</span>
        </div>
        <div className="panel">
          <strong>{unchecked.length}</strong>
          <span>Unchecked</span>
        </div>
      </div>
      {!citations.length && (
        <EmptyState
          title="No references found"
          description={
            report.document.status === "complete"
              ? "No bibliography entries were extracted from this PDF. Try a paper with a References or Bibliography section, or generate a reference from a DOI."
              : "References are not available yet. Complete document extraction before checking them."
          }
          action={
            <Link className="btn btn-secondary" to="/citations">
              Generate a citation from a DOI
            </Link>
          }
        />
      )}
      <div className="citation-list">
        {!!citations.length && (
          <div className="citation-list-tools">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="Search references"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search references, titles or DOIs…"
              />
            </label>
            <label className="select-field">
              <span className="visually-hidden">Reference status</span>
              <select
                aria-label="Reference status"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All references</option>
                <option value="matched">Metadata matches</option>
                <option value="needs_review">Need review</option>
                <option value="unchecked">Unchecked</option>
              </select>
            </label>
            <span className="small muted">
              {visible.length} of {citations.length} references
            </span>
          </div>
        )}
        {!!citations.length && !visible.length && (
          <EmptyState
            title="No matching references"
            description="Try another title, DOI or status filter."
            action={
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            }
          />
        )}
        {visible.map((citation) => {
          const publication = citation.publication;
          const url = safeSourceUrl(publication?.url);
          return (
            <article className="panel citation-card" key={citation.id}>
              <div className="panel-heading">
                <h2>Reference {citation.key}</h2>
                <span
                  className={`badge ${citation.status === "matched" ? "supported" : "review"}`}
                >
                  {citation.status === "matched"
                    ? "Metadata matches"
                    : citation.status === "needs_review"
                      ? "Needs review"
                      : "Unchecked"}
                </span>
              </div>
              <div className="citation-comparison-grid">
                <div>
                  <h3>Printed reference</h3>
                  <p className="citation-reference">{citation.referenceText}</p>
                  <p className="muted">DOI: {citation.doi ?? "Not detected"}</p>
                </div>
                <div>
                  <h3>Registry match</h3>
                  {publication ? (
                    <>
                      <p>
                        <strong>{publication.title}</strong>
                      </p>
                      <p>
                        {publication.authors.join(", ") ||
                          "Authors unavailable"}
                        {publication.year ? ` · ${publication.year}` : ""}
                      </p>
                      <p>DOI: {publication.doi ?? "Not supplied"}</p>
                      {url && (
                        <a
                          className="text-link"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open publication <ArrowUpRight size={16} />
                        </a>
                      )}
                    </>
                  ) : (
                    <p>
                      {citation.status === "unchecked"
                        ? "Run the reference check to look for a publication."
                        : "No confident match was selected. This does not establish that the reference is fabricated."}
                    </p>
                  )}
                </div>
              </div>
              {citation.notes.length > 0 && (
                <ul className="plain-list">
                  {citation.notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              )}
              {!!citation.alternatives.length && (
                <details>
                  <summary>
                    {citation.alternatives.length} possible publication matches
                  </summary>
                  <ul className="plain-list">
                    {citation.alternatives.map((candidate, index) => (
                      <li key={index}>
                        {candidate.title} ·{" "}
                        {candidate.year ?? "Year unavailable"} · DOI:{" "}
                        {candidate.doi ?? "Unavailable"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="button-row">
                <button
                  className="btn btn-secondary"
                  disabled={busy || report.document.mode === "demo"}
                  onClick={() => void check([citation])}
                >
                  {citation.checkedAt ? "Check again" : "Check reference"}
                </button>
                {(publication?.doi ?? citation.doi) && (
                  <Link
                    className="text-link"
                    to={`/citations?${new URLSearchParams({ doi: publication?.doi ?? citation.doi! })}`}
                  >
                    Format APA / IEEE <ArrowUpRight size={16} />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!!report.citationDiagnostics?.length && (
        <section className="panel citation-card">
          <h2>Reference-list notes</h2>
          <ul className="plain-list">
            {report.citationDiagnostics.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
