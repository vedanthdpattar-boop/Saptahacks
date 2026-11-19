import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
import { EmptyState, ErrorState, PageHeader } from "../components/Common";
import { useWorkspace } from "../components/Workspace";
import { api, DEMO_MODE } from "../services/api";
const stages = [
  "Uploading document",
  "Extracting claims",
  "Identifying citations",
  "Searching original publications",
  "Comparing evidence",
  "Generating verification report",
];
function demoPause(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 450);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
export function AnalysisPage() {
  const { id } = useParams();
  const { draft, remember, setDraft } = useWorkspace();
  const navigate = useNavigate();
  const [stage, setStage] = useState(0);
  const [detail, setDetail] = useState("Preparing document");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const documentId = useRef(id);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (id) documentId.current = id;
    if (!draft && !documentId.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setStage(0);
    async function run() {
      try {
        const document = documentId.current
          ? await api.document(documentId.current, abort.signal)
          : await api.upload(draft!, abort.signal);
        if (abort.signal.aborted) return;
        documentId.current = document.id;
        remember(document);
        if (DEMO_MODE) await demoPause(abort.signal);
        setStage(1);
        setDetail(
          DEMO_MODE
            ? "Loading the fixed illustrative claims"
            : "Waiting for backend claim extraction",
        );
        const claims = await api.extract(document.id, abort.signal);
        if (abort.signal.aborted) return;
        setStage(2);
        setDetail(
          DEMO_MODE
            ? "Showing fictional sample citations"
            : `${claims.length} claims returned by the backend`,
        );
        if (DEMO_MODE) await demoPause(abort.signal);
        setStage(3);
        setDetail(
          DEMO_MODE
            ? "Simulated publication lookup; no real sources retrieved"
            : "The verify endpoint searches publications and compares evidence",
        );
        if (DEMO_MODE) await demoPause(abort.signal);
        setStage(4);
        for (let i = 0; i < claims.length; i++) {
          setDetail(
            `${DEMO_MODE ? "Loading illustrative finding" : "Verifying claim"} ${i + 1} of ${claims.length}`,
          );
          await api.verify(claims[i], abort.signal);
          if (abort.signal.aborted) return;
        }
        if (DEMO_MODE) await demoPause(abort.signal);
        setStage(5);
        setDetail("Preparing the claim-by-claim report");
        const report = await api.report(document.id, abort.signal);
        if (abort.signal.aborted) return;
        remember(report.document);
        setDraft(undefined);
        navigate(`/documents/${document.id}/results`, { replace: true });
      } catch (error) {
        if (!abort.signal.aborted) setError((error as Error).message);
      }
    }
    void run();
    return () => abort.abort();
    // The draft is a snapshot for this run; workspace updates must not restart API mutations.
  }, [id, attempt]);
  if (!draft && !documentId.current)
    return (
      <EmptyState
        title="Choose a document first"
        description="Upload a text-based PDF before starting an analysis."
        action={
          <Link className="btn btn-primary" to="/upload">
            Upload a document
          </Link>
        }
      />
    );
  return (
    <>
      <PageHeader
        eyebrow={
          DEMO_MODE ? "Illustrative demonstration" : "Live document processing"
        }
        title="Following the evidence"
        description={draft?.file.name ?? "Continuing document analysis"}
      />
      <section className="panel analysis-panel">
        <div className="analysis-orbit">
          <LoaderCircle size={40} className={error ? "" : "spin"} />
        </div>
        <h2>{error ? "Analysis paused" : stages[stage]}</h2>
        <p role="status" aria-live="polite">
          {error ? "Resolve the error below and retry." : detail}
        </p>
        <div className="analysis-progress">
          <progress
            max={6}
            value={stage}
            aria-label="Analysis stage progress"
          />
          <span>{stage} of 6 stages complete</span>
        </div>
        <ol className="analysis-stages">
          {stages.map((label, index) => (
            <li
              className={
                index < stage ? "done" : index === stage ? "current" : ""
              }
              key={label}
            >
              <span>
                {index < stage ? (
                  <Check size={17} />
                ) : index === stage && !error ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <Circle size={17} />
                )}
              </span>
              <div>
                <strong>{label}</strong>
                <small>
                  {index < stage
                    ? "Complete"
                    : index === stage
                      ? error
                        ? "Needs attention"
                        : "In progress"
                      : "Waiting"}
                </small>
              </div>
            </li>
          ))}
        </ol>
        {error && (
          <ErrorState message={error} retry={() => setAttempt((n) => n + 1)} />
        )}
        <button
          className="btn btn-secondary"
          onClick={() => {
            controller.current?.abort();
            navigate("/upload");
          }}
        >
          <X size={16} />
          Cancel analysis
        </button>
        {!DEMO_MODE && (
          <p className="small muted">
            Cancellation stops browser requests. Work already started by the
            backend may continue.
          </p>
        )}
      </section>
    </>
  );
}
