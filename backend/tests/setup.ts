import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeEach } from "vitest";
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      FILES: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM documents"),
    env.DB.prepare("DELETE FROM sources"),
  ]);
  const objects = await env.FILES.list();
  if (objects.objects.length)
    await env.FILES.delete(objects.objects.map((o) => o.key));
});
