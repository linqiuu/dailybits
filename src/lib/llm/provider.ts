import type { GeneratedKnowledgePoint, GeneratedQuestion } from "@/types";
import { DeepSeekProvider } from "./deepseek";
import { OpenAIProvider } from "./openai";

export interface LLMProvider {
  generateQuestions(text: string, count?: number): Promise<GeneratedQuestion[]>;
  generateKnowledgeCards(
    text: string,
    count?: number,
    systemPrompt?: string,
  ): Promise<GeneratedKnowledgePoint[]>;
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
