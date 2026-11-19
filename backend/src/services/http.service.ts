import { ApiError } from "../middleware/error.middleware";
import type { Bindings } from "../types";

export function allowedExternalUrl(value: string, allowedHosts: string[]) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(
      502,
      "unsafe_source_url",
      "The source returned an invalid URL.",
    );
  }
  if (
    value.length > 2048 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !allowedHosts.includes(url.hostname)
  )
    throw new ApiError(
      502,
      "unsafe_source_url",
      "This source host is outside the supported open-access repositories.",
    );
  return url;
}
export async function readLimited(response: Response, maxBytes: number) {
  const size = Number(response.headers.get("Content-Length"));
  if (size > maxBytes) {
    await response.body?.cancel();
    throw new ApiError(
      502,
      "external_too_large",
      "The external response exceeds the retrieval size limit.",
    );
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "",
    count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes)
        throw new ApiError(
          502,
          "external_too_large",
          "The external response exceeds the retrieval size limit.",
        );
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export async function fetchBounded(
  value: string,
  init: RequestInit,
  allowedHosts: string[],
  timeoutMs = 8000,
  maxBytes = 2000000,
) {
  let url = allowedExternalUrl(value, allowedHosts);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirect = 0; redirect <= 2; redirect++) {
    let response: Response;
    try {
      response = await fetch(url.href, { ...init, redirect: "manual", signal });
    } catch {
      throw new ApiError(
        502,
        "external_timeout",
        "The external service was unreachable or timed out.",
      );
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const target = response.headers.get("Location");
      if (!target || init.method === "POST")
        throw new ApiError(
          502,
          "external_redirect",
          "The external API returned an unexpected redirect.",
        );
      const next = allowedExternalUrl(new URL(target, url).href, allowedHosts);
      if (next.hostname !== url.hostname && init.headers)
        throw new ApiError(
          502,
          "external_redirect",
          "Cross-host redirects with request headers are not permitted.",
        );
      url = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ApiError(
        502,
        `external_http_${response.status}`,
        `The external service returned HTTP ${response.status}.`,
      );
    }
    return {
      text: await readLimited(response, maxBytes),
      url: url.href,
      contentType: response.headers.get("Content-Type") ?? "",
    };
  }
  throw new ApiError(
    502,
    "external_redirect",
    "The source exceeded the redirect limit.",
  );
}
export async function researchJson(
  env: Bindings,
  url: string,
  provider: string,
  headers: Record<string, string> = {},
) {
  if (
    !env.RESEARCH_RATE_LIMITER ||
    !(await env.RESEARCH_RATE_LIMITER.limit({ key: provider })).success
  )
    throw new ApiError(
      502,
      "research_rate_limited",
      "Research service requests reached the shared rate limit. Retry later.",
    );
  const response = await fetchBounded(
    url,
    { headers },
    ["api.crossref.org", "api.openalex.org", "www.ebi.ac.uk"],
    8000,
    1500000,
  );
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    throw new ApiError(
      502,
      "invalid_research_response",
      "The research service returned invalid JSON.",
    );
  }
}
