import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Logo } from "./Common";
import { DEMO_MODE } from "../services/api";

export function MarketingLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="marketing-layout">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="marketing-header">
        <div className="landing-wrap marketing-header-inner">
          <Logo />
          <Link to="/upload" className="btn btn-primary marketing-cta">
            Start Verification <ArrowUpRight size={16} />
          </Link>
          <nav aria-label="Website pages">
            {[
              ["/", "Home"],
              ["/how-it-works", "How it works"],
              ["/features", "Features"],
              ["/dashboard", "Workspace"],
            ].map(([to, label]) => (
              <NavLink key={to} to={to} end>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="marketing-footer">
        <div className="landing-wrap">
          <Logo />
          <p>
            Built for Saptahacks ·{" "}
            {DEMO_MODE
              ? "Illustrative demo; no research verified."
              : "Live results require source review."}
          </p>
          <Link to="/dashboard">
            Open workspace <ArrowUpRight size={15} />
          </Link>
        </div>
      </footer>
    </div>
  );
}
