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

type SyncDirectory = {
  directory: string;
  folderLabel: string;
  defaultKind: SyncKind;
};

function resolveContentRepositoryDirectory() {
  const configured =
    process.env.BANK_CONTENT_DIR?.trim() ||
    process.env.QUESTION_BANKS_REPO_DIR?.trim();
  if (configured) return path.resolve(process.cwd(), configured);
  return path.join(process.cwd(), "question-banks");
}

function formatDirectoryLabel(directory: string) {
  const relative = path.relative(process.cwd(), directory);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replace(/\\/g, "/");
  }
  return directory.replace(/\\/g, "/");
}

function uniquePaths(paths: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const resolved = path.resolve(process.cwd(), item);
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(resolved);
  }
  return result;
}

function resolveSyncDirectories(
  envName: string,
  defaultKind: SyncKind,
  candidates: string[],
): SyncDirectory[] {
  const configured = process.env[envName]?.trim();
  const directories = configured
    ? configured.split(path.delimiter).map((item) => item.trim()).filter(Boolean)
    : candidates;
  return uniquePaths(directories).map((directory) => ({
    directory,
    folderLabel: formatDirectoryLabel(directory),
    defaultKind,
  }));
}

const QUESTION_EXTERNAL_SOURCE = "local-question-banks";
const KNOWLEDGE_EXTERNAL_SOURCE = "local-knowledge-banks";
const DEFAULT_SYNC_TRANSACTION_TIMEOUT_MS = 120_000;

type SyncKind = "question" | "knowledge";

const CONTENT_BANKS_DIR = resolveContentRepositoryDirectory();
const QUESTION_BANK_DIRECTORIES = resolveSyncDirectories("QUESTION_BANKS_DIR", "question", [
  path.join(CONTENT_BANKS_DIR, "questions"),
]);
const KNOWLEDGE_BANK_DIRECTORIES = resolveSyncDirectories("KNOWLEDGE_BANKS_DIR", "knowledge", [
  path.join(CONTENT_BANKS_DIR, "knowledge"),
]);

type SyncOptions = {
  adoptExisting: boolean;
  replace: boolean;
  questionsOnly: boolean;
  knowledgeOnly: boolean;
};

type LocalFile = {
  fileName: string;
  filePath: string;
  folderLabel: string;
  defaultKind: SyncKind;
  slug: string;
};

type RawQuestion = {
  content: string;
  options: Prisma.InputJsonValue;
  correctAnswer: string;
  explanation: string;
  identityHash: string;
  contentHash: string;
};

type RawKnowledgePoint = {
  content: string;
  orderIndex: number;
  identityHash: string;
  contentHash: string;
};

type ParsedBase = {
  title: string;
  description?: string;
  visibility: Visibility;
  visibleDepartments: string[];
};

type ParsedQuestionBankFile = ParsedBase & {
  kind: "question";
  questions: RawQuestion[];
};

type ParsedKnowledgeBankFile = ParsedBase & {
  kind: "knowledge";
  generationPrompt?: string;
  points: RawKnowledgePoint[];
};

type ParsedBankFile = ParsedQuestionBankFile | ParsedKnowledgeBankFile;

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function parseArgs(argv: string[]): SyncOptions {
  const options: SyncOptions = {
    adoptExisting: false,
    replace: false,
    questionsOnly: false,
    knowledgeOnly: false,
  };
  const supported = new Set([
    "--adopt-existing",
    "--replace",
    "--questions-only",
    "--knowledge-only",
    "--help",
  ]);

  for (const arg of argv) {
    if (!supported.has(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (arg === "--help") {
      console.log(
        [
          "Usage: npm run sync:banks -- [--adopt-existing] [--replace]",
          "",
          "By default, the sync scans question-banks/questions/*.json",
          "and question-banks/knowledge/*.json in the current app directory.",
          "Kind detection prefers an explicit type field, then falls back to JSON shape:",
          "  - questions/question objects -> question bank",
          "  - points/cards/items/string arrays -> knowledge cards",
          "",
          "Options:",
          "  --adopt-existing  Bind a unique same-title manual bank owned by the sync owner",
          "                    when no local-sync bank exists for the JSON file.",
          "  --replace         Make the JSON file authoritative.",
          "                    Questions absent from JSON are moved to DRAFT.",
          "                    Knowledge cards absent from JSON are deleted.",
          "  --questions-only  Only sync question-bank files.",
          "  --knowledge-only  Only sync knowledge-card files.",
          "",
          "Env:",
          "  BANK_CONTENT_DIR or QUESTION_BANKS_REPO_DIR override the content repo directory",
          "  QUESTION_BANKS_DIR and KNOWLEDGE_BANKS_DIR override JSON subdirectories",
          "  BANK_SYNC_TRANSACTION_TIMEOUT_MS overrides the per-file transaction timeout",
          `                    default: ${DEFAULT_SYNC_TRANSACTION_TIMEOUT_MS}`,
          "  BANK_SYNC_OWNER_UID, QUESTION_SYNC_OWNER_UID, or KNOWLEDGE_SYNC_OWNER_UID",
          "  DATABASE_URL",
        ].join("\n"),
      );
      process.exit(0);
    }
    if (arg === "--adopt-existing") options.adoptExisting = true;
    if (arg === "--replace") options.replace = true;
    if (arg === "--questions-only") options.questionsOnly = true;
    if (arg === "--knowledge-only") options.knowledgeOnly = true;
  }

  if (options.questionsOnly && options.knowledgeOnly) {
    throw new Error("--questions-only and --knowledge-only cannot be used together");
  }

  return options;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => [key, stableValue(val)]),
    );
  }
  return value;
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function questionIdentityHash(content: string, correctAnswer: string) {
  return hashJson({
    content: normalizeText(content),
    correctAnswer: normalizeText(correctAnswer),
  });
}

function knowledgeIdentityHash(content: string) {
  return hashJson({ content: normalizeText(content) });
}

function isVisibility(value: unknown): value is Visibility {
  return value === "PRIVATE" || value === "PUBLIC" || value === "PARTIAL";
}

function readStringField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readArrayField(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

function parseVisibleDepartments(
  fileName: string,
  raw: Record<string, unknown>,
  visibility: Visibility,
) {
  const source = raw.visibleDepartments ?? raw.departments;
  if (source === undefined) {
    if (visibility === "PARTIAL") {
      throw new Error(
        `${fileName}: visibleDepartments is required when visibility is PARTIAL`,
      );
    }
    return [];
  }
  if (!Array.isArray(source)) {
    throw new Error(`${fileName}: visibleDepartments must be an array of strings`);
  }
  const departments = source
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (visibility === "PARTIAL" && departments.length === 0) {
    throw new Error(
      `${fileName}: visibleDepartments is required when visibility is PARTIAL`,
    );
  }
  return visibility === "PARTIAL" ? departments : [];
}

function parseSharedFields(
  fileName: string,
  slug: string,
  raw: Record<string, unknown>,
): ParsedBase {
  const title =
    typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : slug;
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : undefined;
  const visibility = isVisibility(raw.visibility) ? raw.visibility : "PUBLIC";
  const visibleDepartments = parseVisibleDepartments(fileName, raw, visibility);
  return { title, description, visibility, visibleDepartments };
}

function normalizeKind(value: unknown): SyncKind | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["question", "questions", "question-bank", "question_bank"].includes(normalized)) {
    return "question";
  }
  if (
    ["knowledge", "knowledge-bank", "knowledge_bank", "knowledge-card", "knowledge_cards"].includes(
      normalized,
    )
  ) {
    return "knowledge";
  }
  return undefined;
}

function looksLikeQuestion(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const raw = item as Record<string, unknown>;
  return (
    typeof raw.content === "string" &&
    raw.options !== undefined &&
    typeof raw.correctAnswer === "string"
  );
}

function looksLikeKnowledgePoint(item: unknown) {
  if (typeof item === "string") return true;
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const raw = item as Record<string, unknown>;
  return typeof raw.content === "string" && raw.options === undefined;
}

function inferArrayKind(
  fileName: string,
  items: unknown[],
  defaultKind?: SyncKind,
): SyncKind {
  if (items.length === 0) {
    if (defaultKind) return defaultKind;
    throw new Error(`${fileName}: empty root array needs a type field or folder hint`);
  }
  if (items.every(looksLikeQuestion)) return "question";
  if (items.every(looksLikeKnowledgePoint)) return "knowledge";
  throw new Error(
    `${fileName}: root array must contain either question objects or knowledge strings/cards`,
  );
}

function inferObjectKind(fileName: string, raw: Record<string, unknown>) {
  const explicitKind = normalizeKind(raw.type ?? raw.kind ?? raw.bankType);
  if (explicitKind) return explicitKind;
  if (Array.isArray(raw.questions)) return "question";
  if (
    Array.isArray(raw.points) ||
    Array.isArray(raw.knowledgePoints) ||
    Array.isArray(raw.cards)
  ) {
    return "knowledge";
  }
  if (Array.isArray(raw.items)) {
    return inferArrayKind(fileName, raw.items);
  }
  throw new Error(
    `${fileName}: cannot infer bank type. Add type: "question" or type: "knowledge".`,
  );
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

function validateKnowledgePoint(
  item: unknown,
  label: string,
  orderIndex: number,
): RawKnowledgePoint {
  let content = "";
  let identityKey: string | undefined;

  if (typeof item === "string") {
    content = item.trim();
  } else if (item && typeof item === "object" && !Array.isArray(item)) {
    const raw = item as Record<string, unknown>;
    content = typeof raw.content === "string" ? raw.content.trim() : "";
    identityKey = readStringField(raw, ["id", "slug", "key"]);
  } else {
    throw new Error(`${label} must be a string or an object with content`);
  }

  if (!content) {
    throw new Error(`${label}: content is required`);
  }

  const identityInput = identityKey
    ? { key: normalizeText(identityKey) }
    : { content: normalizeText(content) };
  const identityHash = hashJson(identityInput);

  return {
    content,
    orderIndex,
    identityHash,
    contentHash: hashJson({ ...identityInput, content }),
  };
}

function parseBankFile(
  file: Pick<LocalFile, "fileName" | "slug" | "defaultKind">,
  json: unknown,
): ParsedBankFile {
  const source = Array.isArray(json)
    ? { title: file.slug, items: json }
    : json;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error(`${file.fileName}: root must be an array or object`);
  }

  const raw = source as Record<string, unknown>;
  const kind = Array.isArray(json)
    ? inferArrayKind(file.fileName, json, file.defaultKind)
    : inferObjectKind(file.fileName, raw);
  const shared = parseSharedFields(file.fileName, file.slug, raw);

  if (kind === "question") {
    const questionsRaw = Array.isArray(json)
      ? json
      : readArrayField(raw, ["questions"]);
    if (!Array.isArray(questionsRaw)) {
      throw new Error(`${file.fileName}: questions must be an array`);
    }
    const questions = questionsRaw.map((item, index) =>
      validateQuestion(item, `${file.fileName} question ${index + 1}`),
    );
    const duplicate = findDuplicate(questions.map((q) => q.identityHash));
    if (duplicate) {
      throw new Error(
        `${file.fileName}: duplicate question identity hash ${duplicate}. ` +
          "Check repeated content + correctAnswer.",
      );
    }
    return { kind: "question", ...shared, questions };
  }

  const pointsRaw = Array.isArray(json)
    ? json
    : readArrayField(raw, ["points", "knowledgePoints", "cards", "items"]);
  if (!Array.isArray(pointsRaw)) {
    throw new Error(`${file.fileName}: points must be an array`);
  }
  const points = pointsRaw.map((item, index) =>
    validateKnowledgePoint(item, `${file.fileName} knowledge card ${index + 1}`, index + 1),
  );
  const duplicate = findDuplicate(points.map((point) => point.identityHash));
  if (duplicate) {
    throw new Error(
      `${file.fileName}: duplicate knowledge card identity hash ${duplicate}. ` +
        "Use an id/slug field for cards that intentionally share similar content.",
    );
  }
  const generationPrompt =
    typeof raw.generationPrompt === "string" ? raw.generationPrompt.trim() : undefined;
  return { kind: "knowledge", ...shared, generationPrompt, points };
}

function findDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

async function listJsonFilesInDirectory(
  directory: string,
  folderLabel: string,
  defaultKind: SyncKind,
): Promise<LocalFile[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => ({
      fileName: entry.name,
      filePath: path.join(directory, entry.name),
      folderLabel,
      defaultKind,
      slug: path.basename(entry.name, ".json"),
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

async function listJsonFiles() {
  const filesByDirectory = await Promise.all(
    [...QUESTION_BANK_DIRECTORIES, ...KNOWLEDGE_BANK_DIRECTORIES].map((item) =>
      listJsonFilesInDirectory(item.directory, item.folderLabel, item.defaultKind),
    ),
  );
  return filesByDirectory.flat();
}

function scannedDirectorySummary() {
  return [...QUESTION_BANK_DIRECTORIES, ...KNOWLEDGE_BANK_DIRECTORIES]
    .map((item) => item.folderLabel)
    .join(", ");
}

function isAllowedByKindFilter(parsed: ParsedBankFile, options: SyncOptions) {
  if (options.questionsOnly) return parsed.kind === "question";
  if (options.knowledgeOnly) return parsed.kind === "knowledge";
  return true;
}

async function resolveQuestionBank(
  tx: Prisma.TransactionClient,
  slug: string,
  parsed: ParsedQuestionBankFile,
  ownerId: string,
  options: SyncOptions,
) {
  const existingSynced = await tx.questionBank.findUnique({
    where: {
      externalSource_externalSlug: {
        externalSource: QUESTION_EXTERNAL_SOURCE,
        externalSlug: slug,
      },
    },
    select: { id: true, title: true },
  });

  if (existingSynced) {
    const bank = await tx.questionBank.update({
      where: { id: existingSynced.id },
      data: {
        title: parsed.title,
        description: parsed.description,
        visibility: parsed.visibility,
        visibleDepartments: parsed.visibleDepartments,
        isOfficial: true,
      },
      select: { id: true, title: true },
    });
    return { ...bank, adopted: false, created: false };
  }

  if (options.adoptExisting) {
    const candidates = await tx.questionBank.findMany({
      where: {
        creatorId: ownerId,
        title: parsed.title,
        externalSource: null,
        externalSlug: null,
      },
      select: { id: true, title: true },
    });

    if (candidates.length > 1) {
      throw new Error(
        `${parsed.title}: found ${candidates.length} unbound manual question banks with the same title. ` +
          "Rename extras or bind one manually before using --adopt-existing.",
      );
    }

    if (candidates.length === 1) {
      const bank = await tx.questionBank.update({
        where: { id: candidates[0].id },
        data: {
          title: parsed.title,
          description: parsed.description,
          visibility: parsed.visibility,
          visibleDepartments: parsed.visibleDepartments,
          isOfficial: true,
          externalSource: QUESTION_EXTERNAL_SOURCE,
          externalSlug: slug,
        },
        select: { id: true, title: true },
      });
      return { ...bank, adopted: true, created: false };
    }
  }

  const bank = await tx.questionBank.create({
    data: {
      title: parsed.title,
      description: parsed.description,
      creatorId: ownerId,
      visibility: parsed.visibility,
      visibleDepartments: parsed.visibleDepartments,
      isOfficial: true,
      externalSource: QUESTION_EXTERNAL_SOURCE,
      externalSlug: slug,
    },
    select: { id: true, title: true },
  });

  return { ...bank, adopted: false, created: true };
}

async function resolveKnowledgeBank(
  tx: Prisma.TransactionClient,
  slug: string,
  parsed: ParsedKnowledgeBankFile,
  ownerId: string,
  options: SyncOptions,
) {
  const existingSynced = await tx.knowledgeBank.findUnique({
    where: {
      externalSource_externalSlug: {
        externalSource: KNOWLEDGE_EXTERNAL_SOURCE,
        externalSlug: slug,
      },
    },
    select: { id: true, title: true },
  });
  const sharedData = {
    title: parsed.title,
    description: parsed.description,
    visibility: parsed.visibility,
    visibleDepartments: parsed.visibleDepartments,
    ...(parsed.generationPrompt !== undefined
      ? { generationPrompt: parsed.generationPrompt || null }
      : {}),
  };

  if (existingSynced) {
    const bank = await tx.knowledgeBank.update({
      where: { id: existingSynced.id },
      data: sharedData,
      select: { id: true, title: true },
    });
    return { ...bank, adopted: false, created: false };
  }

  if (options.adoptExisting) {
    const candidates = await tx.knowledgeBank.findMany({
      where: {
        creatorId: ownerId,
        title: parsed.title,
        externalSource: null,
        externalSlug: null,
      },
      select: { id: true, title: true },
    });

    if (candidates.length > 1) {
      throw new Error(
        `${parsed.title}: found ${candidates.length} unbound manual knowledge banks with the same title. ` +
          "Rename extras or bind one manually before using --adopt-existing.",
      );
    }

    if (candidates.length === 1) {
      const bank = await tx.knowledgeBank.update({
        where: { id: candidates[0].id },
        data: {
          ...sharedData,
          externalSource: KNOWLEDGE_EXTERNAL_SOURCE,
          externalSlug: slug,
        },
        select: { id: true, title: true },
      });
      return { ...bank, adopted: true, created: false };
    }
  }

  const bank = await tx.knowledgeBank.create({
    data: {
      ...sharedData,
      creatorId: ownerId,
      externalSource: KNOWLEDGE_EXTERNAL_SOURCE,
      externalSlug: slug,
    },
    select: { id: true, title: true },
  });

  return { ...bank, adopted: false, created: true };
}

function addExistingQuestion(
  map: Map<
    string,
    Array<{
      id: string;
      status: "DRAFT" | "PUBLISHED";
      externalIdentityHash: string | null;
      externalContentHash: string | null;
    }>
  >,
  question: {
    id: string;
    status: "DRAFT" | "PUBLISHED";
    content: string;
    correctAnswer: string;
    externalIdentityHash: string | null;
    externalContentHash: string | null;
  },
) {
  const identity =
    question.externalIdentityHash ??
    questionIdentityHash(question.content, question.correctAnswer);
  const bucket = map.get(identity) ?? [];
  bucket.push({
    id: question.id,
    status: question.status,
    externalIdentityHash: question.externalIdentityHash,
    externalContentHash: question.externalContentHash,
  });
  map.set(identity, bucket);
}

function addExistingKnowledgePoint(
  map: Map<
    string,
    Array<{
      id: string;
      orderIndex: number;
      externalIdentityHash: string | null;
      externalContentHash: string | null;
    }>
  >,
  point: {
    id: string;
    content: string;
    orderIndex: number;
    externalIdentityHash: string | null;
    externalContentHash: string | null;
  },
) {
  const identity = point.externalIdentityHash ?? knowledgeIdentityHash(point.content);
  const bucket = map.get(identity) ?? [];
  bucket.push({
    id: point.id,
    orderIndex: point.orderIndex,
    externalIdentityHash: point.externalIdentityHash,
    externalContentHash: point.externalContentHash,
  });
  map.set(identity, bucket);
}

async function syncQuestionBankFile(
  tx: Prisma.TransactionClient,
  slug: string,
  parsed: ParsedQuestionBankFile,
  ownerId: string,
  options: SyncOptions,
) {
  const bank = await resolveQuestionBank(tx, slug, parsed, ownerId, options);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const keptQuestionIds: string[] = [];
  const existingQuestions = await tx.question.findMany({
    where: { bankId: bank.id },
    select: {
      id: true,
      content: true,
      correctAnswer: true,
      status: true,
      externalIdentityHash: true,
      externalContentHash: true,
    },
  });
  const existingByIdentity = new Map<
    string,
    Array<{
      id: string;
      status: "DRAFT" | "PUBLISHED";
      externalIdentityHash: string | null;
      externalContentHash: string | null;
    }>
  >();
  for (const existing of existingQuestions) {
    addExistingQuestion(existingByIdentity, existing);
  }

  for (const question of parsed.questions) {
    const matches = existingByIdentity.get(question.identityHash) ?? [];
    const externalMatches = matches.filter(
      (match) => match.externalIdentityHash === question.identityHash,
    );
    const existing =
      externalMatches.length === 1
        ? externalMatches[0]
        : matches.length === 1
          ? matches[0]
          : null;

    if (!existing) {
      const createdQuestion = await tx.question.create({
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
        select: { id: true },
      });
      keptQuestionIds.push(createdQuestion.id);
      created++;
      continue;
    }

    keptQuestionIds.push(existing.id);

    if (
      existing.externalIdentityHash === question.identityHash &&
      existing.externalContentHash === question.contentHash &&
      existing.status === "PUBLISHED"
    ) {
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
        externalIdentityHash: question.identityHash,
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
  const replaced = options.replace
    ? await tx.question.updateMany({
        where: {
          bankId: bank.id,
          id: { notIn: keptQuestionIds },
          status: "PUBLISHED",
        },
        data: { status: "DRAFT" },
      })
    : { count: 0 };

  return {
    kind: "question" as const,
    bankTitle: bank.title,
    adopted: bank.adopted,
    createdBank: bank.created,
    created,
    updated,
    skipped,
    replaced: replaced.count,
    reactivated: reactivated.count,
  };
}

async function syncKnowledgeBankFile(
  tx: Prisma.TransactionClient,
  slug: string,
  parsed: ParsedKnowledgeBankFile,
  ownerId: string,
  options: SyncOptions,
) {
  const bank = await resolveKnowledgeBank(tx, slug, parsed, ownerId, options);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const keptPointIds: string[] = [];
  const existingPoints = await tx.knowledgePoint.findMany({
    where: { bankId: bank.id },
    select: {
      id: true,
      content: true,
      orderIndex: true,
      externalIdentityHash: true,
      externalContentHash: true,
    },
  });
  const existingByIdentity = new Map<
    string,
    Array<{
      id: string;
      orderIndex: number;
      externalIdentityHash: string | null;
      externalContentHash: string | null;
    }>
  >();
  for (const existing of existingPoints) {
    addExistingKnowledgePoint(existingByIdentity, existing);
  }

  for (const point of parsed.points) {
    const matches = existingByIdentity.get(point.identityHash) ?? [];
    const externalMatches = matches.filter(
      (match) => match.externalIdentityHash === point.identityHash,
    );
    const existing =
      externalMatches.length === 1
        ? externalMatches[0]
        : matches.length === 1
          ? matches[0]
          : null;

    if (!existing) {
      const createdPoint = await tx.knowledgePoint.create({
        data: {
          bankId: bank.id,
          content: point.content,
          orderIndex: point.orderIndex,
          externalIdentityHash: point.identityHash,
          externalContentHash: point.contentHash,
        },
        select: { id: true },
      });
      keptPointIds.push(createdPoint.id);
      created++;
      continue;
    }

    keptPointIds.push(existing.id);

    if (
      existing.externalIdentityHash === point.identityHash &&
      existing.externalContentHash === point.contentHash &&
      existing.orderIndex === point.orderIndex
    ) {
      skipped++;
      continue;
    }

    await tx.knowledgePoint.update({
      where: { id: existing.id },
      data: {
        content: point.content,
        orderIndex: point.orderIndex,
        externalIdentityHash: point.identityHash,
        externalContentHash: point.contentHash,
      },
    });
    updated++;
  }

  const replaced = options.replace
    ? await tx.knowledgePoint.deleteMany({
        where: {
          bankId: bank.id,
          id: { notIn: keptPointIds },
          externalIdentityHash: { not: null },
        },
      })
    : { count: 0 };

  if (!options.replace) {
    const staleSyncedPoints = existingPoints
      .filter(
        (point) =>
          point.externalIdentityHash &&
          !keptPointIds.includes(point.id) &&
          point.orderIndex <= parsed.points.length,
      )
      .sort((a, b) => a.orderIndex - b.orderIndex);
    for (const [index, point] of staleSyncedPoints.entries()) {
      await tx.knowledgePoint.update({
        where: { id: point.id },
        data: { orderIndex: parsed.points.length + index + 1 },
      });
    }
  }

  return {
    kind: "knowledge" as const,
    bankTitle: bank.title,
    adopted: bank.adopted,
    createdBank: bank.created,
    created,
    updated,
    skipped,
    replaced: replaced.count,
  };
}

function formatResult(file: LocalFile, result: Awaited<ReturnType<typeof syncQuestionBankFile>> | Awaited<ReturnType<typeof syncKnowledgeBankFile>>) {
  const base =
    `[sync] ${file.folderLabel}/${file.fileName} -> ${result.bankTitle} (${result.kind}): ` +
    `${result.created} created, ${result.updated} updated, ` +
    `${result.skipped} skipped, ${result.replaced} removed by replace`;

  if (result.kind === "question") {
    return (
      base.replace("removed by replace", "drafted by replace") +
      `, ${result.reactivated} subscriptions reactivated` +
      `${result.adopted ? ", adopted existing bank" : ""}` +
      `${result.createdBank ? ", created bank" : ""}`
    );
  }

  return (
    base +
    `${result.adopted ? ", adopted existing bank" : ""}` +
    `${result.createdBank ? ", created bank" : ""}`
  );
}

function getOwnerLookup() {
  return (
    process.env.BANK_SYNC_OWNER_UID?.trim() ||
    process.env.QUESTION_SYNC_OWNER_UID?.trim() ||
    process.env.KNOWLEDGE_SYNC_OWNER_UID?.trim()
  );
}

function getTransactionTimeoutMs() {
  const raw = process.env.BANK_SYNC_TRANSACTION_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_SYNC_TRANSACTION_TIMEOUT_MS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 5_000) {
    throw new Error(
      "BANK_SYNC_TRANSACTION_TIMEOUT_MS must be an integer greater than or equal to 5000",
    );
  }

  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ownerUid = getOwnerLookup();
  if (!ownerUid) {
    throw new Error(
      "BANK_SYNC_OWNER_UID, QUESTION_SYNC_OWNER_UID, or KNOWLEDGE_SYNC_OWNER_UID is required",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const transactionTimeoutMs = getTransactionTimeoutMs();
    const owner = await prisma.user.findFirst({
      where: {
        OR: [{ id: ownerUid }, { uid: ownerUid }, { email: ownerUid }],
      },
      select: { id: true, uid: true, email: true },
    });
    if (!owner) {
      throw new Error(`No user found for sync owner=${ownerUid}`);
    }

    const files = await listJsonFiles();
    if (files.length === 0) {
      console.log(
        `[sync] No JSON files found in ${scannedDirectorySummary()}`,
      );
      return;
    }

    const seen = new Set<string>();
    let processed = 0;
    let ignored = 0;

    for (const file of files) {
      const rawText = await fs.readFile(file.filePath, "utf8");
      const parsed = parseBankFile(file, JSON.parse(rawText));

      if (!isAllowedByKindFilter(parsed, options)) {
        ignored++;
        console.log(
          `[sync] ${file.folderLabel}/${file.fileName} ignored (${parsed.kind}) by kind filter`,
        );
        continue;
      }

      const identity = `${parsed.kind}:${file.slug}`;
      if (seen.has(identity)) {
        throw new Error(
          `${file.fileName}: duplicate ${parsed.kind} slug "${file.slug}" across sync folders`,
        );
      }
      seen.add(identity);

      const result = await prisma.$transaction(
        async (tx) => {
          if (parsed.kind === "question") {
            return syncQuestionBankFile(tx, file.slug, parsed, owner.id, options);
          }
          return syncKnowledgeBankFile(tx, file.slug, parsed, owner.id, options);
        },
        { timeout: transactionTimeoutMs },
      );

      processed++;
      console.log(formatResult(file, result));
    }

    console.log(`[sync] Done. ${processed} processed, ${ignored} ignored.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[sync] Failed:", error);
  process.exitCode = 1;
});
