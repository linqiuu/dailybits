import type { GeneratedQuestion } from "@/types";

export interface LLMProvider {
  generateQuestions(text: string, count?: number): Promise<GeneratedQuestion[]>;
}

export function createLLMProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER || "openai";
  switch (provider) {
    case "deepseek":
      return new (require("./deepseek").DeepSeekProvider)();
    case "openai":
    default:
      return new (require("./openai").OpenAIProvider)();
  }
}
