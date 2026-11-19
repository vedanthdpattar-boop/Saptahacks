import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { unstable_readConfig } from "wrangler";

const config = unstable_readConfig(
  { config: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)) },
  { hideWarnings: true },
);
assert.match(
  config.d1_databases?.[0]?.database_id ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Run wrangler d1 create citeverify-db and add the real database_id to wrangler.jsonc before deployment. preview_database_id is for local development only.",
);
const origins = (config.vars?.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
assert(
  origins.length &&
    origins.every((origin) => {
      try {
        const url = new URL(origin);
        return (
          ["http:", "https:"].includes(url.protocol) && url.origin === origin
        );
      } catch {
        return false;
      }
    }),
  "FRONTEND_ORIGIN must contain exact HTTP or HTTPS origins, without wildcard, path or trailing slash.",
);
assert.match(
  config.vars?.CROSSREF_CONTACT_EMAIL ?? "",
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  "Set CROSSREF_CONTACT_EMAIL to your team's actual contact email.",
);
assert(
  ["workers-ai", "gemini"].includes(config.vars?.AI_PROVIDER),
  "Set AI_PROVIDER to workers-ai or gemini.",
);
assert(
  config.r2_buckets?.some((bucket) => bucket.binding === "FILES") ||
    config.kv_namespaces?.some(
      (namespace) =>
        namespace.binding === "FILES_KV" &&
        /^[0-9a-f]{32}$/i.test(namespace.id),
    ),
  "Configure private document storage using the FILES R2 bucket or a real FILES_KV namespace ID.",
);
console.log(
  "Deployment configuration passed. Localhost origins remain valid until the actual Vercel origin is added.",
);
