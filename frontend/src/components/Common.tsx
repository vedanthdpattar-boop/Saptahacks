import {
  AlertCircle,
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useParams, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type {
  Claim,
  ResearchDocument,
  Verdict,
  VerificationReport,
} from "../types";
import { verdicts } from "../types";
import { DEMO_MODE } from "../services/api";
export const statusClass = (verdict: Verdict) =>
  ({
    Supported: "supported",
    "Partially Supported": "partial",
    Unsupported: "unsupported",
    Contradictory: "contradictory",
    "Potentially Outdated": "outdated",
    "Needs Human Review": "review",
  })[verdict];
export function Logo() {
  return (
    <Link className="logo" to="/" aria-label="CiteVerify AI home">
      <span className="logo-mark">
        <ShieldCheck size={22} strokeWidth={2} />
      </span>
      <span>
        CiteVerify<span className="logo-ai">AI</span>
      </span>
    </Link>
  );
}
export function DemoNotice({
  mode = DEMO_MODE ? "demo" : "live",
}: {
  mode?: string;
}) {
  return mode === "demo" ? (
    <div className="mode-notice">
      <Sparkles size={16} />
      <span>
        <strong>Illustrative demo data.</strong> Claims, publications, evidence,
        and scores are fictional. Uploaded text is extracted locally; these
        findings do not verify it.
      </span>
    </div>
  ) : (
    <div className="live-notice">
      <span className="live-dot" />
      Live verification · Review the linked sources before relying on a result.
    </div>
  );
}
export function Badge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`badge ${statusClass(verdict)}`}>
      <span className="status-dot" />
      {verdict}
    </span>
  );
}
export function Confidence({ value }: { value: number | null }) {
  return value === null ? (
    <span className="muted">Not assigned</span>
  ) : (
    <div className="confidence">
      <span>{value}%</span>
      <meter
        min={0}
        max={100}
        value={value}
        aria-label={`Confidence ${value}%`}
      />
    </div>
  );
}
export function PageHeader({
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={24} />
      <div>
        <h2>We couldn’t complete this step</h2>
        <p>{message}</p>
        <div className="button-row">
          {retry && (
            <button className="btn btn-secondary" onClick={retry}>
              Try again
            </button>
          )}
          <Link className="text-link" to="/upload">
            Upload a document <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
export function LoadingState({
  label = "Loading verification report",
}: {
  label?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={28} />
      <p>{label}…</p>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <FileText size={32} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function NoClaimsState({
  document,
  citationCount = 0,
}: {
  document: ResearchDocument;
  citationCount?: number;
}) {
  const complete = document.status === "complete";
  return (
    <>
      <PageHeader
        title={
          complete ? "No scientific claims found" : "No claims available yet"
        }
        description={document.name}
      />
      <EmptyState
        title="Nothing has been verified"
        description={
          citationCount
            ? `No scientific claims were extracted to compare with evidence. ${citationCount} bibliography ${citationCount === 1 ? "reference is" : "references are"} available to check separately. A publication match does not prove that the document’s contents are correct.`
            : complete
              ? "No scientific claims were extracted from this PDF. This does not confirm that its contents are correct. CiteVerify checks research claims against scholarly publications; it cannot verify résumé credentials. Try an academic paper with claims and references."
              : "This document has no extracted claims to display yet. Its contents have not been verified."
        }
        action={
          <Link
            className="btn btn-primary"
            to={
              citationCount ? `/documents/${document.id}/citations` : "/upload"
            }
          >
            {citationCount ? "Check references" : "Upload a research paper"}{" "}
            <ArrowRight size={16} />
          </Link>
        }
      />
    </>
  );
}
export function ReportTabs() {
  const location = useLocation();
  const { id } = useParams();
  return (
    <nav className="report-tabs" aria-label="Analysis views">
      {[
        ["results", "Claims overview"],
        ["citations", "Citation check"],
        ["graph", "Evidence graph"],
        ["report", "Verification report"],
      ].map(([path, title]) => (
        <Link
          key={path}
          className={location.pathname.endsWith(path) ? "active" : ""}
          to={`/documents/${id}/${path}`}
        >
          {title}
        </Link>
      ))}
    </nav>
  );
}
export function VerdictSummary({ report }: { report: VerificationReport }) {
  return (
    <div className="verdict-summary">
      {verdicts.map((verdict) => (
        <div className="summary-stat" key={verdict}>
          <span className={`status-dot ${statusClass(verdict)}`} />
          <span>{verdict}</span>
          <strong>
            {report.claims.filter((c) => c.verdict === verdict).length}
          </strong>
        </div>
      ))}
    </div>
  );
}
export function ReviewNote({ claim }: { claim: Claim }) {
  return (
    <div className="review-note">
      <Check size={18} />
      <div>
        <strong>Human review recommendation</strong>
        <p>{claim.humanReview}</p>
      </div>
    </div>
  );
}
export const formatDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const formatSize = (value: number) =>
  value < 1024 * 1024
    ? `${(value / 1024).toFixed(1)} KB`
    : `${(value / 1024 / 1024).toFixed(1)} MB`;
