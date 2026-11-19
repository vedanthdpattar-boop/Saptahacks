import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { useReport } from "../hooks/useReport";
import { createDemoReport, demoDocument } from "../mocks/demoData";
import { ResultsPage } from "./ResultsPage";
import { ReportPage } from "./ReportPage";
import { CitationsPage } from "./CitationsPage";
import { LoadingState, SourceLoader } from "../components/Common";
import { CitationGeneratorPage } from "./CitationGeneratorPage";
import { EvidenceGraphPage } from "./EvidenceGraphPage";

vi.mock("../hooks/useReport", () => ({ useReport: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["results", ResultsPage],
  ["report", ReportPage],
  ["graph", EvidenceGraphPage],
] as const)(
  "%s never presents zero claims as verified or supported",
  (_, Page) => {
    const report = createDemoReport(demoDocument);
    report.document = {
      ...report.document,
      name: "Synthetic document.pdf",
      mode: "live",
    };
    report.claims = [];
    const render = () =>
      renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(Page)),
      );
    vi.mocked(useReport).mockReturnValue({ report, error: "", retry: vi.fn() });
    const html = render();
    expect(html).toContain("No scientific claims found");
    expect(html).toContain("Nothing has been verified");
    expect(html).toContain("cannot verify résumé credentials");
    expect(html).toContain('href="/upload"');
    expect(html).not.toMatch(
      /Report available|badge supported|Save as PDF|verdict-summary/,
    );

    report.document.status = "processing";
    expect(render()).toContain("No claims available yet");
    expect(render()).not.toContain("No scientific claims found");

    report.claims = createDemoReport(demoDocument).claims;
    vi.stubGlobal("location", { pathname: `/documents/synthetic/${_}` });
    expect(render()).not.toContain("Nothing has been verified");
  },
);

it("keeps bibliography checks available when a document has no claims", () => {
  const report = createDemoReport(demoDocument);
  report.document = { ...report.document, mode: "live" };
  report.claims = [];
  report.citations = [
    {
      id: "synthetic-citation",
      documentId: report.document.id,
      key: "1",
      referenceText: "Synthetic reference only",
      doi: null,
      title: null,
      authors: [],
      year: null,
      status: "needs_review",
      checkedAt: "2026-11-20T00:00:00Z",
      publication: null,
      alternatives: [],
      notes: ["Synthetic lookup found no confident match."],
    },
  ];
  vi.mocked(useReport).mockReturnValue({ report, error: "", retry: vi.fn() });
  const render = (Page: typeof ResultsPage | typeof CitationsPage) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [`/documents/${report.document.id}/results`] },
        createElement(Page),
      ),
    );
  expect(render(ResultsPage)).toContain("Check references");
  expect(render(ResultsPage)).toContain("Nothing has been verified");
  const html = render(CitationsPage);
  expect(html).toContain("Synthetic reference only");
  expect(html).toContain("Needs review");
  expect(html).toContain("does not establish that the reference is fabricated");
  expect(html).not.toContain("badge supported");
});

it("labels the animation as illustration and provides accessible citation inputs", () => {
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(CitationGeneratorPage)),
  );
  expect(html).toContain("Illustration");
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain("Pause illustration");
  expect(html).toContain('for="citation-doi"');
  expect(html).toContain('for="citation-style"');
  expect(html).toContain("does not verify a research claim");
});

it("ties the branded loading screen to an accessible busy state without invented progress", () => {
  const html = renderToStaticMarkup(
    createElement(LoadingState, { label: "Loading source details" }),
  );
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("Loading source details");
  expect(html).not.toContain('role="progressbar"');
  expect(html).not.toMatch(/verified|Supported/);
  expect(
    renderToStaticMarkup(createElement(SourceLoader, { paused: true })),
  ).toContain("is-paused");
});
