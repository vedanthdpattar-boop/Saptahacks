import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileSearch,
  FileText,
  GitBranch,
  ScanText,
  ShieldCheck,
} from "lucide-react";
export function HowItWorksPage() {
  return (
    <section id="process" className="product-info-page">
      <div className="landing-wrap">
        <div className="section-intro">
          <h1>A clear path through the evidence.</h1>
          <p>
            Follow the citation. Inspect the original research. Understand the
            verdict.
          </p>
        </div>
        <div className="process-grid">
          {[
            [
              FileText,
              "01",
              "Upload your research",
              "Select a text-based PDF. Extract its text locally before analysis.",
            ],
            [
              ScanText,
              "02",
              "Identify claims & citations",
              "Locate scientific statements and the references they rely on.",
            ],
            [
              GitBranch,
              "03",
              "Follow the evidence",
              "Compare each statement with passages from its source publication.",
            ],
            [
              ShieldCheck,
              "04",
              "Review the findings",
              "Inspect explanations, limitations, and items requiring human judgment.",
            ],
          ].map(([Icon, step, title, text]) => {
            const I = Icon as typeof FileText;
            return (
              <div className="process-step" key={String(step)}>
                <div className="step-top">
                  <I size={26} />
                  <span>{String(step)}</span>
                </div>
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </div>
            );
          })}
        </div>
        <div className="pipeline" aria-label="Verification process">
          {["Claim", "Citation", "Publication", "Evidence", "Verdict"].map(
            (label, i) => (
              <span key={label}>
                <span className="pipeline-node">{label}</span>
                {i < 4 && <ArrowRight size={18} />}
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
export function FeaturesPage() {
  return (
    <section id="features" className="product-info-page features-page">
      <div className="landing-wrap">
        <div className="section-intro">
          <h1>More than a citation check.</h1>
          <p>Evidence and uncertainty sit beside every finding.</p>
        </div>
        <div className="feature-grid">
          <div className="feature-card">
            <FileSearch />
            <h3>Compare claims with evidence</h3>
            <p>View the statement and supporting passage side by side.</p>
          </div>
          <div className="feature-card">
            <GitBranch />
            <h3>Trace every finding</h3>
            <p>
              Inspect each link from claim to publication in an interactive
              graph.
            </p>
          </div>
          <div className="feature-card">
            <ShieldCheck />
            <h3>Keep judgment explainable</h3>
            <p>
              See six verdicts, confidence indicators, limitations, and review
              recommendations.
            </p>
          </div>
        </div>
        <div className="landing-close">
          <div>
            <h2>Your next paper, with a clearer view.</h2>
            <p>
              Try the complete workflow with clearly labelled illustrative data.
            </p>
          </div>
          <Link className="btn btn-primary" to="/upload">
            Start Verification <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}
