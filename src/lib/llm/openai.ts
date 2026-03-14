import OpenAI from "openai";
import type { LLMProvider } from "./provider";
import type { GeneratedQuestion } from "@/types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts";

function parseJsonResponse(raw: string): GeneratedQuestion[] {
  let text = raw.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("LLM response is not a JSON array");
  }
  const result: GeneratedQuestion[] = [];
  for (const item of parsed) {
    if (
      typeof item?.content === "string" &&
      Array.isArray(item?.options) &&
      typeof item?.correctAnswer === "string" &&
      typeof item?.explanation === "string"
    ) {
      result.push({
        content: item.content.trim(),
        options: item.options.map((o: unknown) => String(o ?? "")),
        correctAnswer: String(item.correctAnswer).trim().toUpperCase().slice(0, 1) || "A",
        explanation: item.explanation.trim(),
      });
    }
  }
  return result;
}

export interface OpenAIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config?: OpenAIProviderConfig) {
    const apiKey = config?.apiKey ?? process.env.LLM_API_KEY;
    if (!apiKey) {
      throw new Error("LLM_API_KEY is required");
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: config?.baseURL ?? process.env.LLM_API_BASE_URL ?? undefined,
    });
    this.model = config?.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  }

  async generateQuestions(text: string, count = 10): Promise<GeneratedQuestion[]> {
    const userPrompt = buildUserPrompt(text, count);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    return parseJsonResponse(content);
  }
}
