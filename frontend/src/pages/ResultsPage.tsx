import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownUp, ArrowUpRight, Download, Search } from "lucide-react";
import {
  Badge,
  Confidence,
  DemoNotice,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ReportTabs,
  VerdictSummary,
} from "../components/Common";
import { useReport } from "../hooks/useReport";
import { verdicts } from "../types";
import { DEMO_MODE } from "../services/api";
export function ResultsPage() {
  const { id = "" } = useParams();
  const { report, error, retry } = useReport(id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("id");
  const claims = useMemo(
    () =>
      [...(report?.claims ?? [])]
        .filter(
          (claim) =>
            (status === "all" || claim.verdict === status) &&
            `${claim.text} ${claim.citation} ${claim.id}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "confidence"
            ? (b.confidence ?? -1) - (a.confidence ?? -1)
            : sort === "status"
              ? a.verdict.localeCompare(b.verdict)
              : a.id.localeCompare(b.id),
        ),
    [report, search, status, sort],
  );
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!report) return <LoadingState />;
  return (
    <>
      {report.document.mode === "demo" && !DEMO_MODE && (
        <DemoNotice mode="demo" />
      )}
      <PageHeader
        eyebrow={`${report.document.pageCount} pages · ${report.document.status === "complete" ? "Analysis complete" : report.document.status}`}
        title="Verification overview"
        description={report.document.name}
        action={
          <Link className="btn btn-secondary" to={`/documents/${id}/report`}>
            <Download size={17} />
            Open report
          </Link>
        }
      />
      <ReportTabs />
      <div className="results-intro">
        <div>
          <strong>{report.claims.length}</strong>
          <span>Claims extracted</span>
        </div>
        <p>
          {report.document.mode === "demo"
            ? "Six illustrative verdicts. Inspect how scope, causality, conflicting results, and missing evidence affect a finding."
            : "Inspect the source passages and limitations before relying on these findings."}
        </p>
        <span className="analysis-status">Report available</span>
      </div>
      <VerdictSummary report={report} />
      <section className="panel claims-panel">
        <div className="panel-heading">
          <div>
            <h2>Claim-by-claim findings</h2>
            <p>Compare statements with the evidence behind them.</p>
          </div>
          <span className="small muted">
            {claims.length} of {report.claims.length} claims
          </span>
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search claims"
              placeholder="Search claims or citations…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="select-field">
            <span className="visually-hidden">
              Filter by verification status
            </span>
            <select
              aria-label="Filter by verification status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              {verdicts.map((verdict) => (
                <option key={verdict}>{verdict}</option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <ArrowDownUp size={16} />
            <select
              aria-label="Sort claims"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="id">Claim order</option>
              <option value="confidence">Highest confidence</option>
              <option value="status">Status A–Z</option>
            </select>
          </label>
        </div>
        {claims.length ? (
          <div className="table-scroll">
            <table className="claim-table">
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Original statement</th>
                  <th>Citation</th>
                  <th>Verdict</th>
                  <th>Confidence</th>
                  <th>
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim, index) => (
                  <tr key={claim.id}>
                    <td className="claim-id">
                      {claim.id.match(/C\d+$/)?.[0] ??
                        String(index + 1).padStart(2, "0")}
                    </td>
                    <td>
                      <Link
                        className="claim-text"
                        to={`/documents/${id}/claims/${claim.id}`}
                      >
                        {claim.text}
                      </Link>
                    </td>
                    <td className="citation-cell">{claim.citation}</td>
                    <td>
                      <Badge verdict={claim.verdict} />
                    </td>
                    <td>
                      <Confidence value={claim.confidence} />
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        aria-label={`View details for claim ${index + 1}: ${claim.text}`}
                        to={`/documents/${id}/claims/${claim.id}`}
                      >
                        <ArrowUpRight size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={
              report.claims.length ? "No matching claims" : "No claims found"
            }
            description={
              report.claims.length
                ? "Try another search or verification status."
                : "The backend returned a report with no claims."
            }
            action={
              report.claims.length ? (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )}
        <div className="table-footnote">
          Confidence reflects a model or illustrative score, not a probability
          of scientific truth.
        </div>
      </section>
    </>
  );
}
