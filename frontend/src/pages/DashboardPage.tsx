import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  ScanText,
  ShieldCheck,
} from "lucide-react";
import {
  EmptyState,
  ErrorState,
  formatDate,
  PageHeader,
} from "../components/Common";
import { useWorkspace } from "../components/Workspace";
import { api, DEMO_MODE } from "../services/api";
import { createDemoReport, demoDocument } from "../mocks/demoData";
export function DashboardPage() {
  const { recent } = useWorkspace();
  const [health, setHealth] = useState("");
  const [healthError, setHealthError] = useState("");
  const [checking, setChecking] = useState(false);
  const demoClaims = DEMO_MODE ? createDemoReport(demoDocument).claims : [];
  const stats = [
    [
      "Documents analyzed",
      DEMO_MODE ? recent.filter((d) => d.status === "complete").length : "—",
      FileText,
      "Available in this session",
    ],
    [
      "Claims extracted",
      DEMO_MODE ? demoClaims.length : "—",
      ScanText,
      DEMO_MODE
        ? "In the illustrative sample"
        : "Open a document to see claims",
    ],
    [
      "Supported claims",
      DEMO_MODE ? 1 : "—",
      ShieldCheck,
      DEMO_MODE ? "In the illustrative sample" : "Source review required",
    ],
    [
      "Requiring review",
      DEMO_MODE ? 5 : "—",
      Clock3,
      DEMO_MODE ? "Non-supported sample findings" : "Awaiting backend analysis",
    ],
  ] as const;
  async function checkHealth() {
    setChecking(true);
    setHealthError("");
    try {
      const result = await api.health();
      setHealth(`Backend status: ${result.status}`);
    } catch (error) {
      setHealthError((error as Error).message);
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="Your research, in focus"
        title="Research workspace"
        description="Start an analysis, inspect the evidence, and keep every finding traceable."
        action={
          <Link className="btn btn-primary" to="/upload">
            <Plus size={18} />
            Upload new document
          </Link>
        }
      />
      <div className="stats-grid">
        {stats.map(([label, value, Icon, description]) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <p>{description}</p>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent analyses</h2>
              <p>
                {DEMO_MODE
                  ? "Documents from this demo session"
                  : "Documents opened in this session"}
              </p>
            </div>
            <FileText size={19} />
          </div>
          {recent.length ? (
            <div className="document-list">
              {recent.map((document) => (
                <Link
                  className="document-row"
                  key={document.id}
                  to={`/documents/${document.id}/${document.status === "complete" ? "results" : "analysis"}`}
                >
                  <span className="document-icon">
                    <FileText size={23} />
                  </span>
                  <div>
                    <strong>{document.name}</strong>
                    <span>
                      {document.pageCount} pages ·{" "}
                      {formatDate(document.createdAt)} ·{" "}
                      {document.mode === "demo"
                        ? "Illustrative demo"
                        : "Live analysis"}
                    </span>
                  </div>
                  <span className="document-status">{document.status}</span>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Your first analysis starts here"
              description="Upload a research document. Session history appears after a successful upload."
              action={
                <Link to="/upload" className="btn btn-secondary">
                  Upload a PDF
                </Link>
              }
            />
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Verification activity</h2>
              <p>
                {DEMO_MODE
                  ? "Illustrative sample activity"
                  : "Backend connection"}
              </p>
            </div>
            <Activity size={19} />
          </div>
          {DEMO_MODE ? (
            <div className="activity-list">
              {[
                [
                  CheckCircle2,
                  "Sample report ready",
                  "6 illustrative findings to inspect",
                ],
                [
                  ShieldCheck,
                  "Evidence compared",
                  "1 supported · 5 require closer review",
                ],
                [
                  ScanText,
                  "Sample claims identified",
                  "All 6 outcomes represented",
                ],
              ].map(([Icon, title, description]) => {
                const I = Icon as typeof Activity;
                return (
                  <div className="activity-item" key={String(title)}>
                    <span>
                      <I size={17} />
                    </span>
                    <div>
                      <strong>{String(title)}</strong>
                      <p>{String(description)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="connection-panel">
              <p>
                Live mode calls your configured API. Document history is limited
                to this session because the requested API has no document-list
                endpoint.
              </p>
              <button
                disabled={checking}
                className="btn btn-secondary"
                onClick={checkHealth}
              >
                {checking ? "Checking…" : "Check backend health"}
              </button>
              {health && <p role="status">{health}</p>}
            </div>
          )}
          {healthError && (
            <ErrorState message={healthError} retry={checkHealth} />
          )}
        </section>
      </div>
      <div className="workspace-callout">
        <span className="callout-icon">
          <FileText size={27} />
        </span>
        <div>
          <h2>See what a complete analysis looks like.</h2>
          <p>
            Explore the sample’s six verdicts, evidence graph, and printable
            report.
          </p>
        </div>
        <Link
          className="btn btn-secondary"
          to={DEMO_MODE ? "/documents/demo-document/results" : "/upload"}
        >
          {DEMO_MODE ? "Open sample analysis" : "Upload a document"}
          <ArrowRight size={17} />
        </Link>
      </div>
    </>
  );
}
