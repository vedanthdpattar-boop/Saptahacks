import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { useReport } from "../hooks/useReport";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { ResultsPage } from "./ResultsPage";
import { ReportPage } from "./ReportPage";
import { EvidenceGraphPage } from "./EvidenceGraphPage";

vi.mock("../hooks/useReport", () => ({ useReport: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["results", ResultsPage],
  ["report", ReportPage],
  ["graph", EvidenceGraphPage],
] as const)("%s never presents zero claims as verified or supported", (_, Page) => {
  const report = createDemoReport(demoDocument);
  report.document = { ...report.document, name: "Synthetic document.pdf", mode: "live" };
  report.claims = [];
  const render = () => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Page)));
  vi.mocked(useReport).mockReturnValue({ report, error: "", retry: vi.fn() });
  const html = render();
  expect(html).toContain("No scientific claims found");
  expect(html).toContain("Nothing has been verified");
  expect(html).toContain("cannot verify résumé credentials");
  expect(html).toContain('href="/upload"');
  expect(html).not.toMatch(/Report available|badge supported|Save as PDF|verdict-summary/);

  report.document.status = "processing";
  expect(render()).toContain("No claims available yet");
  expect(render()).not.toContain("No scientific claims found");

  report.claims = createDemoReport(demoDocument).claims;
  vi.stubGlobal("location", { pathname: `/documents/synthetic/${_}` });
  expect(render()).not.toContain("Nothing has been verified");
});
