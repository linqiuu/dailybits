import { Agent, Dispatcher, EnvHttpProxyAgent } from "undici";
import { BlockList, isIP } from "node:net";

type Environment = Readonly<Record<string, string | undefined>>;
const internalAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16],
] as const) internalAddresses.addSubnet(network, prefix, "ipv4");
internalAddresses.addAddress("::", "ipv6");
internalAddresses.addAddress("::1", "ipv6");
internalAddresses.addSubnet("fc00::", 7, "ipv6");
internalAddresses.addSubnet("fe80::", 10, "ipv6");

const INTERNAL_URL_KEYS = [
  "INNER_API_BASE_URL", "DIRECTORY_API_BASE_URL", "MESSAGING_API_BASE_URL",
  "CARD_SERVICE_API_BASE", "PUSH_API_URL", "DEPARTMENT_API_URL",
];

function isInternal(url: URL, env: Environment): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") && !host.includes(":")) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const family = isIP(host);
  if (family && internalAddresses.check(host, family === 4 ? "ipv4" : "ipv6")) return true;
  return INTERNAL_URL_KEYS.some(key => {
    try { return new URL(env[key] || "").hostname === url.hostname; }
    catch { return false; }
  });
}

function proxyUrl(value: string | undefined): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) throw new Error();
    // Validate escaped credentials here so library errors cannot reveal the URL.
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    return url.href;
  } catch {
    throw new Error("Outbound proxy must be a valid HTTP(S) proxy URL (credentials are not logged)");
  }
}

class ExternalDispatcher extends EnvHttpProxyAgent {
  constructor(options: EnvHttpProxyAgent.Options, private direct: Agent, private env: Environment) {
    super(options);
  }

  override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    // Decide at dispatch time, including redirect hops; internal services never use the external proxy.
    if (isInternal(new URL(String(options.origin)), this.env)) return this.direct.dispatch(options, handler);
    return super.dispatch(options, handler);
  }
}

export class OutboundHttpClient {
  private direct = new Agent();
  private external: ExternalDispatcher;
  private timeoutMs: number;

  constructor(env: Environment = process.env) {
    const override = env.OUTBOUND_PROXY_URL?.trim();
    const httpProxy = proxyUrl(override || env.http_proxy || env.HTTP_PROXY);
    const httpsProxy = proxyUrl(override || env.https_proxy || env.HTTPS_PROXY || httpProxy);
    this.timeoutMs = Number(env.OUTBOUND_HTTP_TIMEOUT_MS || "60000");
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("OUTBOUND_HTTP_TIMEOUT_MS must be a positive integer");
    this.external = new ExternalDispatcher({
      httpProxy, httpsProxy, noProxy: env.no_proxy ?? env.NO_PROXY ?? "",
    }, this.direct, { ...env });
  }

  fetch: typeof fetch = async (input, init) => {
    const inheritedSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = inheritedSignal ?? AbortSignal.timeout(this.timeoutMs);
    try {
      return await globalThis.fetch(input, { ...init, signal, dispatcher: this.external } as RequestInit);
    } catch {
      if (signal.aborted) {
        const name = signal.reason?.name === "TimeoutError" ? "TimeoutError" : "AbortError";
        throw new DOMException(name === "TimeoutError" ? "Outbound request timed out" : "Outbound request aborted", name);
      }
      // Never fall back to direct access or expose proxy URLs/authentication in logs or API errors.
      throw new Error("Outbound request failed; check connectivity, proxy and trusted CA configuration");
    }
  };

  async close(): Promise<void> {
    await Promise.all([this.external.close(), this.direct.close()]);
  }
}

let client: OutboundHttpClient | undefined;
const internalAgent = new Agent();

export const externalFetch: typeof fetch = (input, init) => {
  client ??= new OutboundHttpClient();
  return client.fetch(input, init);
};

// Explicitly direct, even if the host starts Node with global environment-proxy support enabled.
export const internalFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, { ...init, dispatcher: internalAgent } as RequestInit);
