import "dotenv/config";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type Prisma,
  type Visibility,
} from "../src/generated/prisma/client.js";

const QUESTION_BANKS_DIR = path.join(process.cwd(), "question-banks");
const EXTERNAL_SOURCE = "local-question-banks";

type RawQuestion = {
  content: string;
  options: Prisma.InputJsonValue;
  correctAnswer: string;
  explanation: string;
  identityHash: string;
  contentHash: string;
};

type ParsedBankFile = {
  title: string;
  description?: string;
  visibility: Visibility;
  questions: RawQuestion[];
};

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, stableValue(val)])
    );
  }
  return value;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function isVisibility(value: unknown): value is Visibility {
  return value === "PRIVATE" || value === "PUBLIC" || value === "PARTIAL";
}

function validateQuestion(item: unknown, label: string): RawQuestion {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`${label} must be an object`);
  }

  const raw = item as Record<string, unknown>;
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  const correctAnswer =
    typeof raw.correctAnswer === "string" ? raw.correctAnswer.trim() : "";
  const explanation =
    typeof raw.explanation === "string" ? raw.explanation.trim() : "";
  const options = raw.options;

  if (!content) {
    throw new Error(`${label}: content is required`);
  }
  if (!options || typeof options !== "object") {
    throw new Error(`${label}: options must be an object or array`);
  }
  if (!correctAnswer) {
    throw new Error(`${label}: correctAnswer is required`);
  }
  if (typeof raw.explanation !== "string") {
    throw new Error(`${label}: explanation must be a string`);
  }

  const normalizedIdentity = {
    content: normalizeText(content),
    correctAnswer: normalizeText(correctAnswer),
  };
  const normalizedContent = {
    ...normalizedIdentity,
    explanation: normalizeText(explanation),
    options: stableValue(options),
  };

  return {
    content,
    options: JSON.parse(JSON.stringify(options)) as Prisma.InputJsonValue,
    correctAnswer,
    explanation,
    identityHash: hashJson(normalizedIdentity),
    contentHash: hashJson(normalizedContent),
  };
}

function parseBankFile(fileName: string, json: unknown): ParsedBankFile {
  const slug = path.basename(fileName, ".json");
  const source = Array.isArray(json)
    ? { title: slug, questions: json }
    : json;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error(`${fileName}: root must be an array or object`);
  }

  const raw = source as Record<string, unknown>;
  const questionsRaw = raw.questions;
  if (!Array.isArray(questionsRaw)) {
    throw new Error(`${fileName}: questions must be an array`);
  }

  const questions = questionsRaw.map((item, index) =>
    validateQuestion(item, `${fileName} question ${index + 1}`)
  );
  const duplicate = findDuplicate(questions.map((q) => q.identityHash));
  if (duplicate) {
    throw new Error(
      `${fileName}: duplicate question identity hash ${duplicate}. Check repeated content + correctAnswer.`
    );
  }

  const title = typeof raw.title === "string" && raw.title.trim()
    ? raw.title.trim()
    : slug;
  const description =
    typeof raw.description === "string" ? raw.description.trim() : undefined;
  const visibility = isVisibility(raw.visibility) ? raw.visibility : "PUBLIC";

  return { title, description, visibility, questions };
}

function findDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

async function listJsonFiles() {
  let entries;
  try {
    entries = await fs.readdir(QUESTION_BANKS_DIR, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  const ownerUid = process.env.QUESTION_SYNC_OWNER_UID?.trim();
  if (!ownerUid) {
    throw new Error("QUESTION_SYNC_OWNER_UID is required");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const owner = await prisma.user.findFirst({
      where: {
        OR: [{ id: ownerUid }, { uid: ownerUid }, { email: ownerUid }],
      },
      select: { id: true, uid: true, email: true },
    });
    if (!owner) {
      throw new Error(`No user found for QUESTION_SYNC_OWNER_UID=${ownerUid}`);
    }

    const files = await listJsonFiles();
    if (files.length === 0) {
      console.log(`[sync] No JSON files found in ${QUESTION_BANKS_DIR}`);
      return;
    }

    for (const fileName of files) {
      const slug = path.basename(fileName, ".json");
      const filePath = path.join(QUESTION_BANKS_DIR, fileName);
      const rawText = await fs.readFile(filePath, "utf8");
      const parsed = parseBankFile(fileName, JSON.parse(rawText));

      const result = await prisma.$transaction(async (tx) => {
        const bank = await tx.questionBank.upsert({
          where: {
            externalSource_externalSlug: {
              externalSource: EXTERNAL_SOURCE,
              externalSlug: slug,
            },
          },
          create: {
            title: parsed.title,
            description: parsed.description,
            creatorId: owner.id,
            visibility: parsed.visibility,
            visibleDepartments: [],
            isOfficial: true,
            externalSource: EXTERNAL_SOURCE,
            externalSlug: slug,
          },
          update: {
            title: parsed.title,
            description: parsed.description,
            visibility: parsed.visibility,
            visibleDepartments: parsed.visibility === "PARTIAL" ? undefined : [],
            isOfficial: true,
          },
          select: { id: true, title: true },
        });

        let created = 0;
        let updated = 0;
        let skipped = 0;

        for (const question of parsed.questions) {
          const existing = await tx.question.findUnique({
            where: {
              bankId_externalIdentityHash: {
                bankId: bank.id,
                externalIdentityHash: question.identityHash,
              },
            },
            select: { id: true, externalContentHash: true },
          });

          if (!existing) {
            await tx.question.create({
              data: {
                bankId: bank.id,
                content: question.content,
                options: question.options,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation,
                status: "PUBLISHED",
                source: "LOCAL_SYNC",
                externalIdentityHash: question.identityHash,
                externalContentHash: question.contentHash,
              },
            });
            created++;
            continue;
          }

          if (existing.externalContentHash === question.contentHash) {
            skipped++;
            continue;
          }

          await tx.question.update({
            where: { id: existing.id },
            data: {
              content: question.content,
              options: question.options,
              correctAnswer: question.correctAnswer,
              explanation: question.explanation,
              status: "PUBLISHED",
              source: "LOCAL_SYNC",
              externalContentHash: question.contentHash,
            },
          });
          updated++;
        }

        const reactivated =
          created > 0
            ? await tx.subscription.updateMany({
                where: { bankId: bank.id, isActive: false },
                data: { isActive: true, currentCycle: 0 },
              })
            : { count: 0 };

        return {
          bankTitle: bank.title,
          created,
          updated,
          skipped,
          reactivated: reactivated.count,
        };
      });

      console.log(
        `[sync] ${fileName} -> ${result.bankTitle}: ` +
          `${result.created} created, ${result.updated} updated, ` +
          `${result.skipped} skipped, ${result.reactivated} subscriptions reactivated`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[sync] Failed:", error);
  process.exitCode = 1;
});
