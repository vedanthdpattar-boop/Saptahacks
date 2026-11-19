import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  UploadCloud,
  X,
} from "lucide-react";
import { formatSize, PageHeader } from "../components/Common";
import { useWorkspace } from "../components/Workspace";
import { extractPdf } from "../services/pdf.service";
import { DEMO_MODE } from "../services/api";
export function UploadPage() {
  const { draft, setDraft } = useWorkspace();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | undefined>(draft?.file);
  const [progress, setProgress] = useState(draft ? 100 : 0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => controller.current?.abort(), []);
  async function select(files: FileList | File[] | null) {
    if (!files?.length) return;
    controller.current?.abort();
    setDraft(undefined);
    setError("");
    setProgress(0);
    setFile(undefined);
    if (files.length !== 1) {
      setBusy(false);
      setError("Choose one PDF at a time.");
      return;
    }
    const selected = files[0];
    const abort = new AbortController();
    controller.current = abort;
    setFile(selected);
    setBusy(true);
    try {
      const extraction = await extractPdf(selected, setProgress, abort.signal);
      if (!abort.signal.aborted) setDraft({ file: selected, ...extraction });
    } catch (error) {
      if (!abort.signal.aborted) {
        setFile(undefined);
        setError((error as Error).message);
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  function remove() {
    controller.current?.abort();
    setBusy(false);
    setFile(undefined);
    setDraft(undefined);
    setProgress(0);
    setError("");
    if (input.current) input.current.value = "";
  }
  const noText = draft && !draft.text.trim();
  return (
    <>
      <PageHeader
        eyebrow="A closer reading starts here"
        title="Upload your research"
        description="Select a text-based PDF. We’ll extract its text in your browser before analysis."
      />
      <div className="upload-layout">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <h2>Research document</h2>
              <p>One PDF · up to 10 MB</p>
            </div>
            <FileText size={20} />
          </div>
          <div
            className={`dropzone ${drag ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDrag(false);
              void select(event.dataTransfer.files);
            }}
          >
            <span className="upload-icon">
              <UploadCloud size={34} />
            </span>
            <h2>Drop your PDF here</h2>
            <p>or select a document from your computer</p>
            <button
              className="btn btn-secondary"
              onClick={() => input.current?.click()}
            >
              Browse files
            </button>
            <input
              ref={input}
              type="file"
              aria-label="Select PDF document"
              accept=".pdf,application/pdf"
              className="visually-hidden"
              onChange={(event) => {
                void select(event.target.files);
                event.target.value = "";
              }}
            />
            <span className="dropzone-note">
              Text-based PDFs only. Scanned documents need OCR elsewhere.
            </span>
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {file && (
            <div className="selected-file">
              <span className="document-icon">
                <FileText size={24} />
              </span>
              <div>
                <strong>{file.name}</strong>
                <p>
                  {formatSize(file.size)}
                  {draft ? ` · ${draft.pageCount} pages extracted` : ""}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={remove}
                aria-label="Remove selected document"
              >
                <X size={20} />
              </button>
            </div>
          )}
          {busy && (
            <div className="extraction-progress" role="status">
              <div>
                <span>
                  <LoaderCircle className="spin" size={16} />
                  Extracting document text
                </span>
                <strong>{progress}%</strong>
              </div>
              <progress
                max={100}
                value={progress}
                aria-label="PDF extraction progress"
              />
            </div>
          )}
          {noText && (
            <div className="warning-note" role="alert">
              <strong>No extractable text was found.</strong>
              <p>
                This may be a scanned or image-only PDF. OCR is not included.
                Export a searchable PDF or select another document.
              </p>
            </div>
          )}
          {draft && !noText && (
            <details className="text-preview">
              <summary>
                <CheckCircle2 size={16} />
                Text extracted · View preview
              </summary>
              <pre>
                {draft.text.slice(0, 2000)}
                {draft.text.length > 2000
                  ? "\n… Preview limited to 2,000 characters."
                  : ""}
              </pre>
            </details>
          )}
          <div className="upload-actions">
            <span>
              <LockKeyhole size={15} />
              {DEMO_MODE
                ? "Your PDF stays in this browser session."
                : "Starting analysis sends your PDF and text to the backend."}
            </span>
            <button
              className="btn btn-primary"
              disabled={!draft || busy || !!noText}
              onClick={() => navigate("/analysis")}
            >
              Start analysis <ArrowRight size={18} />
            </button>
          </div>
        </section>
        <aside className="upload-help">
          <section className="panel">
            <h2>What happens next</h2>
            <ol className="help-steps">
              <li>Extract statements and citations.</li>
              <li>Find original source publications.</li>
              <li>Compare claims with evidence.</li>
              <li>Generate an explainable report.</li>
            </ol>
            <p className="muted">
              {DEMO_MODE
                ? "In demo mode, these stages use a fixed fictional sample. Your uploaded document is not scientifically verified."
                : "These steps require the live backend. Unavailable endpoints will show an error."}
            </p>
          </section>
          <section className="sample-card">
            <span className="document-icon">
              <FileText size={24} />
            </span>
            <h2>Try the sample document</h2>
            <p>
              A two-page PDF containing six fictional claims, with every
              verification outcome represented.
            </p>
            <a className="text-link" href="/sample-research.pdf" download>
              <Download size={16} />
              Download sample PDF
            </a>
            {DEMO_MODE && (
              <Link to="/documents/demo-document/results" className="text-link">
                Open sample analysis <ArrowRight size={16} />
              </Link>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
