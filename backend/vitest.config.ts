import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2026-11-19",
        d1Databases: ["DB"],
        r2Buckets: ["FILES"],
        bindings: { TEST_MIGRATIONS: await readD1Migrations("./migrations") },
      },
    })),
  ],
  test: {
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 10000,
  },
});
