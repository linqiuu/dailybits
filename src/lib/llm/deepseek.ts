import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "./openai";

/**
 * DeepSeek is OpenAI API compatible. Reuses OpenAI implementation with
 * DeepSeek-specific defaults.
 */
export class DeepSeekProvider extends OpenAIProvider implements LLMProvider {
  constructor() {
    super({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_API_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.LLM_MODEL ?? "deepseek-chat",
    });
  }
}
