import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  GitBranch,
  Quote,
} from "lucide-react";
import {
  Badge,
  Confidence,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  ReviewNote,
} from "../components/Common";
import { useReport } from "../hooks/useReport";
import { safeSourceUrl } from "../services/api";
export function ClaimDetailsPage() {
  const { id = "", claimId } = useParams();
  const { report, error, retry } = useReport(id);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!report) return <LoadingState />;
  const claim = report.claims.find((c) => c.id === claimId);
  if (!claim)
    return (
      <EmptyState
        title="Claim not found"
        description="This claim is not part of the document’s report."
        action={
          <Link className="btn btn-secondary" to={`/documents/${id}/results`}>
            Back to claims
          </Link>
        }
      />
    );
  const source = safeSourceUrl(claim.publication?.url);
  return (
    <>
      <Link className="back-link" to={`/documents/${id}/results`}>
        <ArrowLeft size={16} />
        Back to all claims
      </Link>
      <PageHeader
        eyebrow="Claim details"
        title="A statement and its evidence"
        description={report.document.name}
        action={
          <Link
            className="btn btn-secondary"
            to={`/documents/${id}/graph?claim=${encodeURIComponent(claim.id)}`}
          >
            <GitBranch size={17} />
            Trace evidence
          </Link>
        }
      />
      <div className="claim-verdict">
        <Badge verdict={claim.verdict} />
        <div>
          <span className="muted">Confidence</span>
          <Confidence value={claim.confidence} />
        </div>
      </div>
      <div className="comparison-grid">
        <section className="panel comparison-claim">
          <div className="panel-heading">
            <h2>
              <Quote size={19} />
              Original claim
            </h2>
            <span className="small muted">
              From{" "}
              {report.document.mode === "demo"
                ? "the illustrative sample"
                : "the document"}
            </span>
          </div>
          <blockquote>{claim.text}</blockquote>
          <div className="comparison-meta">
            <span className="eyebrow">Matched citation</span>
            <p>{claim.citation}</p>
          </div>
        </section>
        <section className="panel comparison-evidence">
          <div className="panel-heading">
            <h2>
              <BookOpen size={19} />
              Research evidence
            </h2>
          </div>
          {claim.evidence ? (
            <blockquote>{claim.evidence}</blockquote>
          ) : (
            <div className="missing-evidence">
              No relevant evidence passage is available. A human review is
              required.
            </div>
          )}
          <div className="comparison-meta">
            <span className="eyebrow">Source reference</span>
            <p>{claim.evidenceReference ?? "Not provided"}</p>
          </div>
        </section>
      </div>
      <div className="details-grid">
        <section className="panel detail-explanation">
          <h2>Why this verdict</h2>
          <p>{claim.explanation}</p>
          <h3>Limitations identified</h3>
          <ul className="plain-list">
            {claim.limitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <ReviewNote claim={claim} />
        </section>
        <section className="panel publication-panel">
          <h2>Original publication</h2>
          {claim.publication ? (
            <>
              <h3>{claim.publication.title}</h3>
              <dl>
                <dt>Authors</dt>
                <dd>
                  {claim.publication.authors.join(", ") || "Not provided"}
                </dd>
                <dt>Year</dt>
                <dd>{claim.publication.year ?? "Not provided"}</dd>
                <dt>DOI</dt>
                <dd>{claim.publication.doi ?? "Not provided"}</dd>
                <dt>Source URL</dt>
                <dd>
                  {source ? (
                    <a
                      className="text-link"
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open publication <ArrowUpRight size={15} />
                    </a>
                  ) : (
                    "No source link available"
                  )}
                </dd>
              </dl>
            </>
          ) : (
            <p>No original publication was matched.</p>
          )}
          {report.document.mode === "demo" && (
            <p className="publication-note">
              Fictional publication. No DOI or source link exists for this
              illustrative example.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
