import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chrome",
    headless: true,
  },
  webServer: [
    {
      command: "npm run dev -- --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_DEMO_MODE: "true",
        VITE_API_BASE_URL: "http://localhost:8787",
      },
    },
    {
      command: "npm run dev -- --port 4174 --strictPort",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_DEMO_MODE: "false",
        VITE_API_BASE_URL: "http://localhost:8787",
      },
    },
  ],
});
