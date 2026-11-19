import { useState } from "react";
import {
  BookOpen,
  FileText,
  Link2,
  Pause,
  Play,
  ShieldCheck,
} from "lucide-react";

export function CitationOrbit() {
  const [paused, setPaused] = useState(false);
  return (
    <figure className={`citation-orbit ${paused ? "is-paused" : ""}`}>
      <div className="orbit-heading">
        <span className="eyebrow">Follow the reference</span>
        <span>Illustration</span>
      </div>
      <div
        className="orbit-stage"
        role="img"
        aria-label="A document, DOI and publication orbit a central source, illustrating citation traceability."
      >
        <div className="orbit-grid" aria-hidden="true" />
        <div className="orbit-track orbit-track-outer" aria-hidden="true">
          <span className="orbit-satellite">
            <FileText size={21} />
          </span>
        </div>
        <div className="orbit-track orbit-track-middle" aria-hidden="true">
          <span className="orbit-satellite">
            <Link2 size={20} />
          </span>
        </div>
        <div className="orbit-track orbit-track-inner" aria-hidden="true">
          <span className="orbit-satellite">
            <BookOpen size={19} />
          </span>
        </div>
        <div className="orbit-core" aria-hidden="true">
          <ShieldCheck size={34} />
          <span>SOURCE</span>
        </div>
      </div>
      <figcaption>
        <strong>Every reference has a source.</strong>
        <p>
          A DOI connects the citation to a publication. The evidence still needs
          a closer reading.
        </p>
      </figcaption>
      <button
        type="button"
        className="orbit-motion-control"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? <Play size={14} /> : <Pause size={14} />}
        {paused ? "Resume illustration" : "Pause illustration"}
      </button>
    </figure>
  );
}
