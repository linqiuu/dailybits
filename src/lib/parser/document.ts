import { createLLMProvider } from "@/lib/llm/provider";
import type { GeneratedQuestion } from "@/types";

const CHUNK_SIZE = 2000;
const DEFAULT_COUNT_PER_CHUNK = 3;

/**
 * Split long text into ~2000 char chunks, respecting paragraph boundaries.
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    const slice = remaining.slice(0, CHUNK_SIZE);
    const lastNewline = slice.lastIndexOf("\n");
    const lastPara = slice.lastIndexOf("\n\n");
    const splitAt = lastPara >= CHUNK_SIZE / 2
      ? lastPara + 2
      : lastNewline >= CHUNK_SIZE / 2
        ? lastNewline + 1
        : CHUNK_SIZE;

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Generate questions from long text by chunking and calling LLM per chunk.
 */
export async function generateFromLongText(
  text: string,
  count?: number
): Promise<GeneratedQuestion[]> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return [];

  const llm = createLLMProvider();
  const perChunk = count
    ? Math.max(1, Math.ceil(count / chunks.length))
    : DEFAULT_COUNT_PER_CHUNK;

  const results: GeneratedQuestion[] = [];

  for (const chunk of chunks) {
    const questions = await llm.generateQuestions(chunk, perChunk);
    results.push(...questions);
  }

  if (count && results.length > count) {
    return results.slice(0, count);
  }

  return results;
}
