import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  GitBranch,
  Quote,
  Upload,
} from "lucide-react";
import { Badge, Confidence } from "../components/Common";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { DEMO_MODE } from "../services/api";
const sampleClaims = createDemoReport(demoDocument).claims;
export function LandingPage() {
  const [selected, setSelected] = useState(1);
  const claim = sampleClaims[selected];
  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="landing-wrap home-grid">
          <div className="home-copy">
            <h1>
              Every Citation Has a Story. <span>Verify It.</span>
            </h1>
            <p>
              A citation is not proof by itself. Check scientific claims against
              the research behind them, with evidence you can inspect.
            </p>
            <div className="button-row">
              <Link className="btn btn-primary" to="/upload">
                Start Verification <ArrowRight size={18} />
              </Link>
              <Link className="btn home-secondary" to="/how-it-works">
                Explore How It Works
              </Link>
            </div>
            <div className="home-flow">
              <span>Upload a paper</span>
              <ArrowRight size={15} />
              <span>Review claims</span>
              <ArrowRight size={15} />
              <span>Trace evidence</span>
            </div>
          </div>
          <section
            className="interactive-preview"
            aria-label="Interactive illustrative verification preview"
          >
            <div className="interactive-preview-top">
              <span>
                <FileText size={18} />
                Try a finding
              </span>
              <span className="demo-chip">Fictional demo</span>
            </div>
            <div
              className="verdict-picker"
              aria-label="Choose a sample verdict"
            >
              {[0, 1, 3].map((index) => (
                <button
                  key={index}
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                >
                  {sampleClaims[index].verdict}
                </button>
              ))}
            </div>
            <div className="preview-finding" aria-live="polite">
              <div className="finding-label">
                <Quote size={16} />
                Original claim
              </div>
              <p className="finding-claim">{claim.text}</p>
              <div className="finding-verdict">
                <Badge verdict={claim.verdict} />
                <Confidence value={claim.confidence} />
              </div>
              <div className="finding-label">
                <GitBranch size={16} />
                Evidence says
              </div>
              <p className="finding-evidence">{claim.evidence}</p>
            </div>
            <div className="interactive-preview-bottom">
              <span>Illustrative claims and evidence, not real research.</span>
              <Link
                to={
                  DEMO_MODE
                    ? `/documents/demo-document/claims/${claim.id}`
                    : "/upload"
                }
              >
                Inspect finding <ArrowUpRight size={16} />
              </Link>
            </div>
          </section>
        </div>
      </section>
      <section
        className="home-launchpad landing-wrap"
        aria-label="Open an app screen"
      >
        <div>
          <h2>Your research workspace</h2>
          <p>Choose where to start.</p>
        </div>
        <div className="launchpad-links">
          <Link to="/upload">
            <Upload size={20} />
            <span>Upload a document</span>
            <ArrowUpRight size={17} />
          </Link>
          <Link to="/dashboard">
            <FileText size={20} />
            <span>Open dashboard</span>
            <ArrowUpRight size={17} />
          </Link>
          <Link to={DEMO_MODE ? "/documents/demo-document/graph" : "/upload"}>
            <GitBranch size={20} />
            <span>
              {DEMO_MODE ? "Explore evidence graph" : "Start a live analysis"}
            </span>
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
