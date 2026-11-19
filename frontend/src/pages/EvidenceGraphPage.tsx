import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  GitBranch,
  Quote,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  NoClaimsState,
  ErrorState,
  LoadingState,
  PageHeader,
  ReportTabs,
} from "../components/Common";
import { useReport } from "../hooks/useReport";
export function EvidenceGraphPage() {
  const { id = "" } = useParams();
  const { report, error, retry } = useReport(id);
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(0);
  if (error) return <ErrorState message={error} retry={retry} />;
  if (!report) return <LoadingState />;
  const claim =
    report.claims.find((c) => c.id === params.get("claim")) ?? report.claims[0];
  if (!claim)
    return (
      <NoClaimsState
        document={report.document}
        citationCount={report.citations?.length}
      />
    );
  const nodes = [
    {
      label: "Original claim",
      caption: "The statement under review",
      Icon: FileText,
      text: claim.text,
    },
    {
      label: "Matched citation",
      caption: "The referenced source",
      Icon: Quote,
      text: claim.citation,
    },
    {
      label: "Publication",
      caption: claim.publication?.year?.toString() ?? "Year not provided",
      Icon: BookOpen,
      text: claim.publication?.title ?? "No matched publication",
    },
    {
      label: "Evidence passage",
      caption: claim.evidence
        ? "Relevant source excerpt"
        : "Passage unavailable",
      Icon: GitBranch,
      text:
        claim.evidence ??
        "No relevant passage was retrieved. Human review is required.",
    },
    {
      label: "Verification result",
      caption: claim.verdict,
      Icon: ShieldCheck,
      text: claim.explanation,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="A transparent evidence trail"
        title="Evidence graph"
        description="Follow the path from a statement to its verdict. Select any node to inspect it."
      />
      <ReportTabs />
      <div className="graph-toolbar">
        <label htmlFor="graph-claim">Inspect claim</label>
        <select
          id="graph-claim"
          value={claim.id}
          onChange={(event) => {
            setParams({ claim: event.target.value });
            setSelected(0);
          }}
        >
          {report.claims.map((c, index) => (
            <option key={c.id} value={c.id}>
              Claim {index + 1}: {c.text.slice(0, 70)}
            </option>
          ))}
        </select>
        <Badge verdict={claim.verdict} />
      </div>
      <section className="panel graph-panel">
        <div className="evidence-graph">
          {nodes.map(({ label, caption, Icon }, index) => (
            <div className="graph-node-wrap" key={label}>
              <button
                className={`graph-node ${selected === index ? "selected" : ""}`}
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                <span className="graph-icon">
                  <Icon size={23} />
                </span>
                <span className="node-number">0{index + 1}</span>
                <strong>{label}</strong>
                <span>{caption}</span>
              </button>
              {index < nodes.length - 1 && (
                <span className="graph-edge" aria-hidden="true">
                  <ArrowRight className="desktop-arrow" size={22} />
                  <ArrowDown className="mobile-arrow" size={22} />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="node-inspector" aria-live="polite">
          <span className="eyebrow">
            Node 0{selected + 1} · {nodes[selected].label}
          </span>
          <h2>{nodes[selected].label}</h2>
          <p>{nodes[selected].text}</p>
          {selected === 3 && claim.evidenceReference && (
            <span className="muted">{claim.evidenceReference}</span>
          )}
          {selected === 4 && <Badge verdict={claim.verdict} />}
          <Link
            className="text-link"
            to={`/documents/${id}/claims/${claim.id}`}
          >
            Open full claim details <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>
      <p className="graph-note">
        {report.document.mode === "demo"
          ? "Every node represents illustrative demo data. No real publication or evidence was retrieved."
          : "A visible connection shows traceability, not proof of a claim. Read the passages and review the limitations."}
      </p>
    </>
  );
}
