import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Workspace } from "./components/Workspace";
import { Layout } from "./components/Layout";
import { MarketingLayout } from "./components/MarketingLayout";
import { FeaturesPage, HowItWorksPage } from "./pages/ProductInfoPages";
import { EmptyState } from "./components/Common";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UploadPage } from "./pages/UploadPage";
import { AnalysisPage } from "./pages/AnalysisPage";
import { ResultsPage } from "./pages/ResultsPage";
import { ClaimDetailsPage } from "./pages/ClaimDetailsPage";
import { EvidenceGraphPage } from "./pages/EvidenceGraphPage";
import { ReportPage } from "./pages/ReportPage";
export function App() {
  return (
    <BrowserRouter>
      <Workspace>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/features" element={<FeaturesPage />} />
          </Route>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/documents/:id/analysis" element={<AnalysisPage />} />
            <Route path="/documents/:id/results" element={<ResultsPage />} />
            <Route
              path="/documents/:id/claims/:claimId"
              element={<ClaimDetailsPage />}
            />
            <Route
              path="/documents/:id/graph"
              element={<EvidenceGraphPage />}
            />
            <Route path="/documents/:id/report" element={<ReportPage />} />
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  description="This page does not exist in the research workspace."
                  action={
                    <Link className="btn btn-primary" to="/dashboard">
                      Open workspace
                    </Link>
                  }
                />
              }
            />
          </Route>
        </Routes>
      </Workspace>
    </BrowserRouter>
  );
}
