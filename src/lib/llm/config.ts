const DEFAULT_LLM_TIMEOUT_MS = 120_000;

export function getLlmTimeoutMs(): number {
  const value = Number(process.env.LLM_TIMEOUT_MS ?? DEFAULT_LLM_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LLM_TIMEOUT_MS;
}
