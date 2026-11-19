import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  Check,
  FileSearch,
  GitBranch,
  MoveRight,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { Badge, Confidence } from "../components/Common";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { DEMO_MODE } from "../services/api";

const sampleClaims = createDemoReport(demoDocument).claims;
const previewVerdicts = [0, 1, 3];

const capabilities = [
  {
    number: "01",
    icon: FileSearch,
    title: "Find the claim inside the paper",
    description:
      "Turn dense research into a clear list of claims and citations you can review one by one.",
    detail: "Claim extraction",
  },
  {
    number: "02",
    icon: GitBranch,
    title: "Follow the evidence trail",
    description:
      "See which source supports a claim, where the wording differs, and when the evidence is incomplete.",
    detail: "Source comparison",
  },
  {
    number: "03",
    icon: BookOpenCheck,
    title: "Keep people in the loop",
    description:
      "Review limitations, flag uncertain findings, and take a readable report into your next discussion.",
    detail: "Human review",
  },
];

const workflow = [
  ["Add a research PDF", "Choose one text-based PDF, up to 25 MB."],
  ["Extract claims and citations", "Review the statements the paper makes."],
  ["Compare evidence", "Inspect source passages, verdicts, and limitations."],
  ["Export a reviewable report", "Keep the reasoning visible for your team."],
];

export function LandingPage() {
  const [selected, setSelected] = useState(1);
  const claim = sampleClaims[selected];

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-grid" aria-hidden="true" />
        <div className="landing-wrap home-grid">
          <div className="home-copy">
            <div className="home-kicker">
              <span className="home-kicker-mark"><Sparkles size={14} /></span>
              AI-assisted research review
            </div>
            <h1>
              Read the research.
              <span>Follow the evidence.</span>
            </h1>
            <p>
              Check scientific claims against the sources behind them. See what
              supports a finding, what is missing, and where a human should take
              a closer look.
            </p>
            <div className="button-row home-actions">
              <Link className="btn btn-primary home-primary" to="/upload">
                Check a research paper <ArrowRight size={17} />
              </Link>
              <Link className="home-text-link" to="/how-it-works">
                See how it works <MoveRight size={16} />
              </Link>
            </div>
            <div className="home-proof-note">
              <ShieldCheck size={16} />
              Transparent evidence. Human judgment stays in control.
            </div>
          </div>

          <section
            className="interactive-preview"
            aria-label="Interactive illustrative verification preview"
          >
            <div className="preview-glow" aria-hidden="true" />
            <div className="interactive-preview-top">
              <span className="preview-app-title">
                <span className="preview-file-icon"><BookOpenCheck size={17} /></span>
                <span>
                  <strong>Research review</strong>
                  <small>One paper · 6 claims found</small>
                </span>
              </span>
              <span className="demo-chip"><span /> Illustrative demo</span>
            </div>

            <div className="preview-progress" aria-label="Review workflow">
              <span className="complete"><Check size={12} /></span>
              <i />
              <span className="complete"><Check size={12} /></span>
              <i />
              <span className="current"><Activity size={13} /></span>
              <i />
              <span>4</span>
              <small>Evidence review</small>
            </div>

            <div className="verdict-picker" aria-label="Choose a sample verdict">
              {previewVerdicts.map((index) => (
                <button
                  key={index}
                  aria-pressed={selected === index}
                  onClick={() => setSelected(index)}
                >
                  {sampleClaims[index].verdict}
                </button>
              ))}
            </div>

            <div className="preview-finding" key={claim.id} aria-live="polite">
              <div className="preview-claim-heading">
                <span className="finding-label">
                  <span className="claim-index">0{selected + 1}</span>
                  EXTRACTED CLAIM
                </span>
                <span className="preview-more">•••</span>
              </div>
              <p className="finding-claim">{claim.text}</p>
              <div className="finding-verdict">
                <Badge verdict={claim.verdict} />
                <div className="confidence-block">
                  <Confidence value={claim.confidence} />
                </div>
              </div>
              <div className="evidence-preview">
                <div className="evidence-preview-heading">
                  <span className="evidence-spark"><Sparkles size={13} /></span>
                  <span>WHAT THE SOURCE SAYS</span>
                  <span className="evidence-match">Source matched</span>
                </div>
                <p className="finding-evidence">{claim.evidence}</p>
                <div className="source-line">
                  <span className="source-dot" />
                  <span>Illustrative source passage</span>
                  <ArrowUpRight size={13} />
                </div>
              </div>
            </div>

            <div className="interactive-preview-bottom">
              <span>Sample claim and evidence for interface preview only.</span>
              <Link
                to={
                  DEMO_MODE
                    ? `/documents/demo-document/claims/${claim.id}`
                    : "/upload"
                }
              >
                Explore review <ArrowUpRight size={15} />
              </Link>
            </div>
          </section>
        </div>
      </section>

      <section className="home-principles" aria-label="Product principles">
        <div className="landing-wrap principles-grid">
          <div className="principle-intro">
            <span className="eyebrow">Made for careful readers</span>
            <p>More clarity at every step of a literature review.</p>
          </div>
          <div className="principle-item">
            <span className="principle-icon"><FileSearch size={18} /></span>
            <span><strong>6 verdict types</strong><small>Nuance beyond yes or no</small></span>
          </div>
          <div className="principle-item">
            <span className="principle-icon"><GitBranch size={18} /></span>
            <span><strong>Evidence you can trace</strong><small>Source passages stay visible</small></span>
          </div>
          <div className="principle-item">
            <span className="principle-icon"><ShieldCheck size={18} /></span>
            <span><strong>Human review included</strong><small>Uncertainty is surfaced</small></span>
          </div>
        </div>
      </section>

      <section className="home-capabilities landing-wrap" id="features">
        <div className="section-heading">
          <span className="eyebrow">A clearer way to verify</span>
          <div className="section-heading-row">
            <h2>Give every claim a path back to its source.</h2>
            <p>
              An AI-assisted workflow that makes the reasoning easier to
              inspect, question, and share.
            </p>
          </div>
        </div>
        <div className="capability-grid">
          {capabilities.map(({ number, icon: Icon, title, description, detail }) => (
            <article className="capability-card" key={number}>
              <div className="capability-card-top">
                <span className="capability-icon"><Icon size={20} /></span>
                <span className="capability-number">{number}</span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="capability-detail"><Check size={13} /> {detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="home-workflow">
        <div className="landing-wrap workflow-layout">
          <div className="workflow-copy">
            <span className="eyebrow">From PDF to perspective</span>
            <h2>Your paper stays readable. The evidence gets easier to follow.</h2>
            <p>
              Move from a document to a structured review without hiding the
              source material or the limits of an automated check.
            </p>
            <Link className="home-text-link workflow-link" to="/how-it-works">
              Walk through the process <ArrowRight size={16} />
            </Link>
          </div>
          <div className="workflow-list">
            {workflow.map(([title, description], index) => (
              <article className="workflow-step" key={title}>
                <span className="workflow-step-index">0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                {index < workflow.length - 1 && <span className="workflow-connector" />}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-final-cta landing-wrap">
        <div className="final-cta-card">
          <div className="final-cta-orbit orbit-one" aria-hidden="true" />
          <div className="final-cta-orbit orbit-two" aria-hidden="true" />
          <div className="final-cta-copy">
            <span className="eyebrow">Start with one paper</span>
            <h2>Make your next research review more transparent.</h2>
            <p>Upload a text-based PDF and inspect each finding at your own pace.</p>
          </div>
          <Link className="btn btn-primary home-primary" to="/upload">
            <Upload size={16} /> Start a paper review <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
