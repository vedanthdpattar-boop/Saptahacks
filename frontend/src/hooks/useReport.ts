import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { VerificationReport } from "../types";
export function useReport(id: string) {
  const [report, setReport] = useState<VerificationReport>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(undefined);
    setError("");
    api
      .report(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReport(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "The report could not be loaded.",
          );
      });
    return () => controller.abort();
  }, [id, attempt]);
  return { report, error, retry: () => setAttempt((n) => n + 1) };
}
