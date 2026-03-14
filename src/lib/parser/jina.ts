const JINA_READER_BASE = "https://r.jina.ai";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface JinaFetchOptions {
  timeout?: number;
}

/**
 * Fetch URL content via Jina Reader API, returns Markdown as plain text.
 * Uses JINA_API_KEY as Bearer token if available.
 */
export async function fetchUrlAsMarkdown(
  url: string,
  options: JinaFetchOptions = {}
): Promise<string> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const encoded = encodeURIComponent(url);
  const readerUrl = `${JINA_READER_BASE}/${encoded}`;

  const headers: Record<string, string> = {
    Accept: "text/plain",
    "X-Return-Format": "markdown",
  };

  const apiKey = process.env.JINA_API_KEY;
  if (apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(readerUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Jina Reader failed: ${res.status} ${res.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`
      );
    }

    const text = await res.text();
    return text ?? "";
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(`Jina Reader timeout after ${timeout}ms`);
      }
      throw err;
    }
    throw new Error("Jina Reader request failed");
  } finally {
    clearTimeout(timeoutId);
  }
}
