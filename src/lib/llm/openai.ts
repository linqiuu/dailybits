import OpenAI from "openai";
import type { LLMProvider } from "./provider";
import type { GeneratedKnowledgePoint, GeneratedQuestion } from "@/types";
import {
  DEFAULT_KNOWLEDGE_CARD_PROMPT,
  SYSTEM_PROMPT,
  buildKnowledgeCardUserPrompt,
  buildUserPrompt,
} from "./prompts";
import { getLlmTimeoutMs } from "./config";

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

function parseKnowledgeCardResponse(raw: string): GeneratedKnowledgePoint[] {
  let text = raw.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("LLM response is not a JSON array");
  }
  return parsed
    .map((item) => {
      if (typeof item === "string") return { content: item.trim() };
      if (typeof item?.content === "string") return { content: item.content.trim() };
      return null;
    })
    .filter((item): item is GeneratedKnowledgePoint => !!item && item.content.length > 0);
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
      timeout: getLlmTimeoutMs(),
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

  async generateKnowledgeCards(
    text: string,
    count = 10,
    systemPrompt = DEFAULT_KNOWLEDGE_CARD_PROMPT,
  ): Promise<GeneratedKnowledgePoint[]> {
    const userPrompt = buildKnowledgeCardUserPrompt(text, count);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt || DEFAULT_KNOWLEDGE_CARD_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from LLM");
    }

    return parseKnowledgeCardResponse(content);
  }
}
