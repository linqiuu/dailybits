import type { GeneratedQuestion } from "@/types";
import { DeepSeekProvider } from "./deepseek";
import { OpenAIProvider } from "./openai";

export interface LLMProvider {
  generateQuestions(text: string, count?: number): Promise<GeneratedQuestion[]>;
}

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "openai";
  switch (provider) {
    case "deepseek":
      return new DeepSeekProvider();
    case "openai":
    default:
      return new OpenAIProvider();
  }
}
