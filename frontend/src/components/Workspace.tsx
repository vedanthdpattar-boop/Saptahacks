import { createContext, useContext, useState, type ReactNode } from "react";
import type { ResearchDocument, UploadDraft } from "../types";
import { api } from "../services/api";
interface WorkspaceState {
  draft?: UploadDraft;
  setDraft: (draft?: UploadDraft) => void;
  recent: ResearchDocument[];
  remember: (document: ResearchDocument) => void;
}
const Context = createContext<WorkspaceState | null>(null);
export function Workspace({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<UploadDraft>();
  const [recent, setRecent] = useState(api.recentDocuments);
  return (
    <Context.Provider
      value={{
        draft,
        setDraft,
        recent,
        remember: (document) =>
          setRecent((items) => [
            document,
            ...items.filter((item) => item.id !== document.id),
          ]),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("Workspace is unavailable.");
  return context;
}
