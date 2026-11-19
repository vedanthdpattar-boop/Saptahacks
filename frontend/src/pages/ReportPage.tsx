import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Download, FileText, Printer } from "lucide-react";
import {
  Badge,
  Confidence,
  DemoNotice,
  EmptyState,
  ErrorState,
  formatDate,
  LoadingState,
  NoClaimsState,
  PageHeader,
  ReportTabs,
  VerdictSummary,
} from "../components/Common";
import { useReport } from "../hooks/useReport";
import { safeSourceUrl } from "../services/api";
import type { Claim } from "../types";

function ReportClaim({ claim, index }: { claim: Claim; index: number }) {
  const source = safeSourceUrl(claim.publication?.url);
  return (
    <section className="report-claim">
      <div className="report-claim-heading">
        <h3>Claim {String(index + 1).padStart(2, "0")}</h3>
        <Badge verdict={claim.verdict} />
        <Confidence value={claim.confidence} />
      </div>
      <h4>Original claim</h4>
      <p>{claim.text}</p>
      <h4>Matched citation</h4>
      <p>{claim.citation}</p>
      <h4>
        {claim.verdict === "Contradictory"
          ? "Conflicting evidence"
          : "Evidence assessed"}
      </h4>
      <blockquote>
        {claim.evidence ?? "Relevant evidence is unavailable."}
      </blockquote>
      <p className="small muted">
        {claim.evidenceReference ?? "Source section or page not provided"}
      </p>
      <h4>Explanation</h4>
      <p>{claim.explanation}</p>
      <h4>Source publication</h4>
      <p>
        {claim.publication?.title ?? "No publication matched"}
        <br />
        {claim.publication?.authors.join(", ")}
        {claim.publication?.year ? ` · ${claim.publication.year}` : ""}
        <br />
        DOI: {claim.publication?.doi ?? "Not provided"}
      </p>
      {source && (
        <a
          className="report-source"
          href={source}
          target="_blank"
          rel="noopener noreferrer"
        >
          {source}
        </a>
      )}
      <h4>Limitations</h4>
      <ul className="plain-list">
        {claim.limitations.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <h4>Human review recommendation</h4>
      <p>{claim.humanReview}</p>
    </section>
  );
}
export function ReportPage() {
  const { id = "" } = useParams();
  const { report, error, retry } = useReport(id);
  const [printHint, setPrintHint] = useState(false);
  const [view, setView] = useState("summary");
  const [selectedClaim, setSelectedClaim] = useState("");
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!report) return <LoadingState />;
  if (!report.claims.length)
    return (
      <NoClaimsState
        document={report.document}
        citationCount={report.citations?.length}
      />
    );
  const claim =
    report.claims.find((c) => c.id === selectedClaim) ?? report.claims[0];
  const reviewClaims = report.claims.filter((c) => c.verdict !== "Supported");
  function savePdf() {
    setPrintHint(true);
    setTimeout(() => window.print(), 0);
  }
  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Verification report"
          description={report.document.name}
          action={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => window.print()}
              >
                <Printer size={17} />
                Print report
              </button>
              <button className="btn btn-primary" onClick={savePdf}>
                <Download size={17} />
                Save as PDF
              </button>
            </>
          }
        />
        <ReportTabs />
        {printHint && (
          <p className="print-hint" role="status">
            In your browser’s print dialog, choose “Save as PDF” as the
            destination. All claims and source information are included.
          </p>
        )}
        <nav className="report-view-switch" aria-label="Report sections">
          {[
            ["summary", "Summary"],
            ["findings", "Claim findings"],
            ["review", "Human review"],
            ["limitations", "Limitations"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <section className="report-workspace" aria-label="Interactive report">
          {view === "summary" && (
            <>
              <div className="report-overview-card">
                <div className="report-overview-icon">
                  <FileText size={30} />
                </div>
                <div>
                  <h2>Your verification summary</h2>
                  <p>
                    {report.claims.length} claims · {report.document.pageCount}{" "}
                    pages · Generated {formatDate(report.generatedAt)}
                  </p>
                </div>
                <Badge
                  verdict={
                    reviewClaims.length ? "Needs Human Review" : "Supported"
                  }
                />
              </div>
              <VerdictSummary report={report} />
              <div className="report-action-grid">
                <button onClick={() => setView("findings")}>
                  <strong>Inspect claim findings</strong>
                  <span>Read the claim, evidence, and reasoning together.</span>
                  <ArrowUpRight size={20} />
                </button>
                <button onClick={() => setView("review")}>
                  <strong>
                    {reviewClaims.length} claims need a closer look
                  </strong>
                  <span>See the human review recommendations.</span>
                  <ArrowUpRight size={20} />
                </button>
              </div>
              <p className="report-score-note">
                Confidence indicators are{" "}
                {report.document.mode === "demo"
                  ? "fictional demonstration scores"
                  : "backend model scores"}
                , not probabilities of scientific truth.
              </p>
            </>
          )}
          {view === "findings" &&
            (claim ? (
              <div className="report-finding-view">
                <label className="report-claim-selector">
                  Select a claim
                  <select
                    value={claim.id}
                    onChange={(event) => setSelectedClaim(event.target.value)}
                  >
                    {report.claims.map((c, index) => (
                      <option key={c.id} value={c.id}>
                        Claim {index + 1} · {c.verdict}
                      </option>
                    ))}
                  </select>
                </label>
                <ReportClaim
                  claim={claim}
                  index={report.claims.indexOf(claim)}
                />
                <Link
                  className="text-link"
                  to={`/documents/${id}/claims/${claim.id}`}
                >
                  Open claim comparison <ArrowUpRight size={16} />
                </Link>
              </div>
            ) : (
              <EmptyState
                title="No claim findings"
                description="The report has no extracted claims."
              />
            ))}
          {view === "review" && (
            <div className="report-review-view">
              <h2>Human review queue</h2>
              {reviewClaims.length ? (
                reviewClaims.map((c) => (
                  <Link
                    className="review-queue-row"
                    to={`/documents/${id}/claims/${c.id}`}
                    key={c.id}
                  >
                    <div>
                      <Badge verdict={c.verdict} />
                      <h3>{c.text}</h3>
                      <p>{c.humanReview}</p>
                    </div>
                    <ArrowUpRight size={20} />
                  </Link>
                ))
              ) : (
                <p>
                  No non-supported findings were flagged. Inspect original
                  sources before relying on the report.
                </p>
              )}
            </div>
          )}
          {view === "limitations" && (
            <div className="report-limits-view">
              <h2>Scope and limitations</h2>
              <ul className="plain-list">
                {report.limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      <article className="report-paper print-report">
        <div className="report-masthead">
          <div>
            <span className="report-brand">CiteVerify AI</span>
            <h1>Scientific claim verification report</h1>
            <p>{report.document.name}</p>
          </div>
          <span className="report-stamp">
            {report.document.mode === "demo"
              ? "Illustrative demo"
              : "Live analysis"}
          </span>
        </div>
        <DemoNotice mode={report.document.mode} />
        <dl className="report-metadata">
          <div>
            <dt>Document</dt>
            <dd>{report.document.name}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{report.document.pageCount}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{formatDate(report.generatedAt)}</dd>
          </div>
          <div>
            <dt>Total claims</dt>
            <dd>{report.claims.length}</dd>
          </div>
        </dl>
        <section className="report-section">
          <h2>Verification summary</h2>
          <VerdictSummary report={report} />
          <p>
            Confidence indicators are{" "}
            {report.document.mode === "demo"
              ? "fictional demonstration scores"
              : "backend model scores"}
            . They are not calibrated probabilities of scientific truth.
          </p>
        </section>
        <section className="report-section">
          <h2>Limitations and review scope</h2>
          <ul className="plain-list">
            {report.limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
        <section className="report-section">
          <h2>Items requiring human review</h2>
          {reviewClaims.map((c, index) => (
            <div className="report-review-item" key={c.id}>
              <strong>
                {index + 1}. {c.verdict}
              </strong>
              <p>{c.humanReview}</p>
            </div>
          ))}
          {reviewClaims.length === 0 && (
            <p>
              No non-supported claims were flagged. Original sources still
              require review before reliance.
            </p>
          )}
        </section>
        <section className="report-section">
          <h2>Claim-by-claim results</h2>
          {report.claims.map((c, index) => (
            <ReportClaim key={c.id} claim={c} index={index} />
          ))}
        </section>
        <footer className="report-end">
          {report.document.mode === "demo"
            ? "Illustrative demo report. Do not use these fictional findings as scientific evidence."
            : "AI-assisted findings require human source review."}
          <span>CiteVerify AI · {formatDate(report.generatedAt)}</span>
        </footer>
      </article>
    </>
  );
}
