import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, Link, useMatch } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  FileSearch,
  LayoutDashboard,
  Menu,
  Upload,
  GitBranch,
  FileText,
  X,
  Quote,
} from "lucide-react";
import { DemoNotice, Logo } from "./Common";
import { DEMO_MODE } from "../services/api";
export function Layout() {
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);
  const location = useLocation();
  const match = useMatch("/documents/:id/*");
  const documentId =
    match?.params.id ?? (DEMO_MODE ? "demo-document" : undefined);
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (open)
      document.querySelector<HTMLButtonElement>(".sidebar-close")?.focus();
    else if (wasOpen.current)
      document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const nav = [
    ["/dashboard", "Dashboard", LayoutDashboard],
    ["/upload", "Upload document", Upload],
    ["/citations", "Citation generator", Quote],
    ...(documentId
      ? [
          [
            `/documents/${documentId}/results`,
            "Verification results",
            FileSearch,
          ] as const,
          [
            `/documents/${documentId}/citations`,
            "Citation check",
            BookOpen,
          ] as const,
          [
            `/documents/${documentId}/graph`,
            "Evidence graph",
            GitBranch,
          ] as const,
          [`/documents/${documentId}/report`, "Report", FileText] as const,
        ]
      : []),
    ["/", "About CiteVerify", BookOpen],
  ] as const;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Logo />
        <button
          className="icon-button sidebar-close"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="sidebar-label">Research workspace</div>
        <nav aria-label="Main navigation">
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <BookOpen size={20} />
            </span>
            <strong>Evidence before certainty.</strong>
            <p>Trace every statement back to its source.</p>
            <Link to="/how-it-works">
              See the process <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="workspace-profile">
            <div className="avatar">R</div>
            <div>
              <strong>Research workspace</strong>
              <span>{DEMO_MODE ? "Demo session" : "Live session"}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-body" inert={open}>
        <header className="app-topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {location.pathname.includes("upload")
                ? "New verification"
                : location.pathname.includes("analysis")
                  ? "Analysis in progress"
                  : location.pathname.includes("documents")
                    ? "Document analysis"
                    : "Overview"}
            </strong>
          </span>
          <span className={`mode-pill ${DEMO_MODE ? "demo" : "live"}`}>
            <span />
            {DEMO_MODE ? "Demo mode" : "Live mode"}
          </span>
        </header>
        <main id="main" className="workspace-main" tabIndex={-1}>
          <DemoNotice />
          <div className="workspace-view" key={location.pathname}>
            <Outlet />
          </div>
        </main>
        <footer className="app-footer">
          CiteVerify AI <span>Scientific claims deserve a closer look.</span>
        </footer>
      </div>
      {open && (
        <button
          className="menu-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
