import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
test("public pages are separate and the sample finding is interactive", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Contradictory", exact: true })
    .click();
  await expect(page.locator(".preview-finding")).toContainText("p = 0.31");
  await expect(page.locator(".interactive-preview")).toContainText(
    "Fictional demo",
  );
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(
    page.getByRole("heading", { name: "A clear path through the evidence." }),
  ).toBeVisible();
  await expect(page.locator(".home-hero")).toHaveCount(0);
  await page.getByRole("link", { name: "Features", exact: true }).click();
  await expect(page).toHaveURL(/\/features$/);
  await expect(
    page.getByRole("heading", { name: "More than a citation check." }),
  ).toBeVisible();
  await expect(page.locator(".process-grid")).toHaveCount(0);
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".feature-grid, .process-grid")).toHaveCount(0);
});
test("navigation, search, filter, comparison, graph and report work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Every Citation Has a Story. Verify It.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Workspace", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Research workspace" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open sample analysis" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await page
    .getByRole("textbox", { name: "Search claims" })
    .fill("remote monitoring");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Search claims" }).fill("");
  await page
    .getByLabel("Filter by verification status")
    .selectOption("Contradictory");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: /View details for claim/ }).click();
  await expect(
    page.getByRole("heading", { name: "Why this verdict" }),
  ).toBeVisible();
  await expect(page.getByText("p = 0.31", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Trace evidence" }).click();
  await page.getByRole("button", { name: /Verification result/ }).click();
  await expect(page.locator(".node-inspector")).toContainText(
    "The statement says",
  );
  await page
    .getByRole("link", { name: "Verification report", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your verification summary" }),
  ).toBeVisible();
  await expect(page.locator(".print-report")).toBeHidden();
  await page
    .getByRole("button", { name: "Claim findings", exact: true })
    .click();
  await page
    .getByLabel("Select a claim")
    .selectOption({ label: "Claim 4 · Contradictory" });
  await expect(page.locator(".report-finding-view .report-claim")).toHaveCount(
    1,
  );
  await expect(page.locator(".report-finding-view")).toContainText("p = 0.31");
  await page.getByRole("button", { name: "Human review", exact: true }).click();
  await expect(page.locator(".review-queue-row")).toHaveCount(5);
  await page.getByRole("button", { name: "Limitations", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Scope and limitations" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = "true";
    };
  });
  await page.getByRole("button", { name: "Save as PDF" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-printed", "true");
  await expect(page.getByRole("status")).toContainText("Save as PDF");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect(page.locator(".report-paper")).toBeVisible();
  await expect(page.locator(".print-report .report-claim")).toHaveCount(6);
  await expect(page.locator(".report-view-switch")).toBeHidden();
  expect(errors).toEqual([]);
});
test("real PDF extraction, removal, no-text warning, validation and analysis", async ({
  page,
}) => {
  await page.goto("/upload");
  const input = page.getByLabel("Select PDF document");
  await input.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a PDF");
  await input.setInputFiles({
    name: "fake.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toContainText("valid PDF header");
  await input.setInputFiles("tests/no-text.pdf");
  await expect(page.getByRole("alert")).toContainText("No extractable text");
  await expect(
    page.getByRole("button", { name: "Start analysis" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Remove selected document" }).click();
  await input.setInputFiles("public/sample-research.pdf");
  await expect(
    page.getByText("2 pages extracted", { exact: false }),
  ).toBeVisible();
  await page.getByText("Text extracted · View preview").click();
  await expect(page.locator(".text-preview")).toContainText(
    "structured retrieval practice",
  );
  await page.getByRole("button", { name: "Start analysis" }).click();
  await expect(
    page.getByRole("heading", { name: "Following the evidence" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Verification overview" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator(".mode-notice")).toContainText("fictional");
});
test("drag and drop extracts a PDF", async ({ page }) => {
  await page.goto("/upload");
  const bytes = [...readFileSync("public/sample-research.pdf")];
  await page.locator(".dropzone").evaluate((element, data) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(data)], "dropped.pdf", {
        type: "application/pdf",
      }),
    );
    element.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
    );
  }, bytes);
  await expect(
    page.getByText("2 pages extracted", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start analysis" }),
  ).toBeEnabled();
});
test("mobile and tablet layouts stay inside the viewport", async ({ page }) => {
  for (const width of [1440, 1024, 820, 768, 662, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const path of [
      "/",
      "/how-it-works",
      "/features",
      "/dashboard",
      "/upload",
      "/documents/demo-document/results",
      "/documents/demo-document/graph",
      "/documents/demo-document/report",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
    }
  }
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
  await page
    .getByRole("link", { name: "Upload document", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Upload your research" }),
  ).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
});
test("live unavailable backend shows an error and no demo findings", async ({
  page,
}) => {
  // Synthetic session token lets this test reach the intentionally unavailable API.
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "citeverify.documentToken.real-document",
      "k".repeat(43),
    ),
  );
  await page.route("http://localhost:8787/**", (route) =>
    route.fulfill({
      status: route.request().method() === "OPTIONS" ? 204 : 404,
      contentType: "application/json",
      body: route.request().method() === "OPTIONS" ? "" : "{}",
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:4174",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
      },
    }),
  );
  await page.goto("http://127.0.0.1:4174/documents/real-document/results");
  await expect(page.getByRole("alert")).toContainText("HTTP 404");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect(page.getByText("Live mode", { exact: true })).toBeVisible();
});
