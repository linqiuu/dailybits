import OpenAI from "openai";
import type { DigestType } from "../../types";
import { getLlmTimeoutMs } from "../llm/config";

export interface DigestItem {
  title: string;
  url?: string;
  source?: string;
  summary: string;
  meta?: string;
}

interface GithubRepo {
  fullName: string;
  url: string;
  description: string;
  language?: string;
  totalStars?: string;
  forks?: string;
  starsToday?: string;
  aiSummary?: string;
}

interface GithubSearchRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics?: string[];
}

interface HnHit {
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  points?: number;
  author?: string;
  created_at?: string;
}

interface ArxivPaper {
  title: string;
  url: string;
  authors: string[];
  summary: string;
  published: string | undefined;
  primaryCategory: string | undefined;
}

interface AihotDailyItem {
  title?: string;
  summary?: string;
  sourceUrl?: string;
  sourceName?: string;
}

interface AihotDailySection {
  label?: string;
  items?: AihotDailyItem[];
}

interface AihotDailyResponse {
  date?: string;
  sections?: AihotDailySection[];
}

interface AihotSelectedItem {
  title?: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  category?: string;
}

interface AihotSelectedResponse {
  items?: AihotSelectedItem[];
}

const DEFAULT_AI_NEWS_FEEDS = [
  "https://openai.com/news/rss.xml",
  "https://news.mit.edu/rss/topic/artificial-intelligence2",
];
const DEFAULT_ARXIV_AI_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "stat.ML"];
const DEFAULT_AIHOT_API_BASE_URL = "https://aihot.virxact.com";
const DEFAULT_AIHOT_DAILY_READY_TIME = "08:10";
const DEFAULT_AIHOT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const DEFAULT_README_SUMMARY_MAX_CHARS = 5000;
const DEFAULT_README_SUMMARY_CONCURRENCY = 2;
const DEFAULT_DIGEST_AI_CONCURRENCY = 3;
const DEFAULT_DIGEST_ITEM_LIMIT = 12;
const DIGEST_OVERVIEW_PAGE_SIZE = 4;
const DIGEST_OVERVIEW_PAGE_COUNT = 3;
const DIGEST_OVERVIEW_ITEM_LIMIT =
  DIGEST_OVERVIEW_PAGE_SIZE * DIGEST_OVERVIEW_PAGE_COUNT;
const DEFAULT_ARXIV_FETCH_ATTEMPTS = 2;
const DEFAULT_ARXIV_RETRY_BASE_MS = 15000;
const DEFAULT_NEWS_TRANSLATION_MAX_CHARS = 1800;
const DEFAULT_ARXIV_TRANSLATION_MAX_CHARS = 3500;

let digestSummaryClient: OpenAI | null | undefined;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value: string): string {
  return compactWhitespace(decodeHtml(value).replace(/<[^>]*>/g, " "));
}

function firstMatch(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1];
}

function markdownLink(label: string, url?: string): string {
  return url ? `[${label}](${url})` : label;
}

function escapeMarkdownTableCell(value: string | undefined): string {
  return compactWhitespace(value || "-").replace(/\|/g, "\\|");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}

function oneLineSummary(value: string | undefined, maxLength: number): string {
  const text = compactWhitespace(value || "No summary provided.");
  const sentence = text.match(/^(.+?[。.!?！？；;])(?:\s|$)/)?.[1] ?? text;
  return truncate(sentence, maxLength);
}

function splitIntoOverviewPages<T>(items: T[]): T[][] {
  const normalized = items.slice(0, DIGEST_OVERVIEW_ITEM_LIMIT);
  const pages: T[][] = [];
  for (let index = 0; index < normalized.length; index += DIGEST_OVERVIEW_PAGE_SIZE) {
    pages.push(normalized.slice(index, index + DIGEST_OVERVIEW_PAGE_SIZE));
  }
  return pages;
}

function formatOverviewTables(
  title: string,
  headers: string[],
  rows: string[][],
): string[] {
  const pages = splitIntoOverviewPages(rows);
  return pages.map((pageRows, index) => [
    `### ${title} ${index + 1}/${pages.length}`,
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...pageRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n"));
}

function formatGithubStarTrend(repo: GithubRepo): string {
  const parts = [
    repo.totalStars ? `⭐ ${repo.totalStars}` : null,
    repo.starsToday ? `今日 +${repo.starsToday}` : null,
  ].filter(Boolean);
  return parts.join(" / ") || "-";
}

function clampDigestItemLimit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DIGEST_ITEM_LIMIT;
  return Math.min(Math.floor(value), DIGEST_OVERVIEW_ITEM_LIMIT);
}

function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getDigestItemLimit(): number {
  return clampDigestItemLimit(Number(process.env.DIGEST_ITEM_LIMIT ?? DEFAULT_DIGEST_ITEM_LIMIT));
}

export function formatGithubOverviewPages(repos: GithubRepo[]): string[] {
  return formatOverviewTables(
    "GitHub Trending 总览",
    ["项目", "语言", "Star 趋势", "一句话总结"],
    repos.map((repo) => [
      escapeMarkdownTableCell(markdownLink(repo.fullName, repo.url)),
      escapeMarkdownTableCell(repo.language),
      escapeMarkdownTableCell(formatGithubStarTrend(repo)),
      escapeMarkdownTableCell(oneLineSummary(repo.aiSummary || repo.description, 88)),
    ]),
  );
}

export function formatAiNewsOverviewPages(items: DigestItem[]): string[] {
  return formatOverviewTables(
    "AI 新闻总览",
    ["标题", "来源", "一句话摘要"],
    items.map((item) => [
      escapeMarkdownTableCell(markdownLink(item.title, item.url)),
      escapeMarkdownTableCell(item.source),
      escapeMarkdownTableCell(oneLineSummary(item.summary, 96)),
    ]),
  );
}

export function formatArxivOverviewPages(papers: ArxivPaper[]): string[] {
  return formatOverviewTables(
    "arXiv 论文总览",
    ["论文", "发布时间", "一句话摘要"],
    papers.map((paper) => [
      escapeMarkdownTableCell(markdownLink(paper.title, paper.url)),
      escapeMarkdownTableCell(paper.published?.slice(0, 10)),
      escapeMarkdownTableCell(oneLineSummary(paper.summary, 100)),
    ]),
  );
}

export function getGithubReadmeSummaryMaxChars(): number {
  const value = Number(process.env.GITHUB_README_SUMMARY_MAX_CHARS ?? DEFAULT_README_SUMMARY_MAX_CHARS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_README_SUMMARY_MAX_CHARS;
}

export function buildGithubReadmeSummaryText(
  repo: Pick<GithubRepo, "fullName" | "description" | "language">,
  readme: string,
  maxChars = getGithubReadmeSummaryMaxChars(),
): string {
  return [
    `Project: ${repo.fullName}`,
    repo.description ? `GitHub description: ${repo.description}` : "",
    repo.language ? `Language: ${repo.language}` : "",
    "",
    truncate(readme, maxChars),
  ]
    .filter(Boolean)
    .join("\n");
}

export function getGithubReadmeSummaryInstruction(): string {
  return [
    "请基于这个 GitHub 项目的 README，用简体中文写 3 到 5 句总结。",
    "必须说明：它解决什么问题、核心能力是什么、适合谁关注或使用。",
    "不要逐字翻译 README，不要添加原文没有的信息，不要输出英文摘要，不要输出 Markdown，不要输出标题。",
  ].join("\n");
}

function getAihotApiBaseUrl(): string {
  return (process.env.AIHOT_API_BASE_URL ?? DEFAULT_AIHOT_API_BASE_URL).replace(/\/+$/, "");
}

function getAihotHeaders(): Record<string, string> {
  return {
    "User-Agent": process.env.AIHOT_USER_AGENT ?? DEFAULT_AIHOT_USER_AGENT,
  };
}

function parseGithubTrending(html: string, limit: number): GithubRepo[] {
  const articles = html.match(/<article[\s\S]*?<\/article>/g) ?? [];
  const repos: GithubRepo[] = [];

  for (const article of articles) {
    const href = firstMatch(article, /<h2[\s\S]*?<a[^>]+href="\/([^"]+)"/);
    if (!href) continue;

    const fullName = compactWhitespace(href);
    const description = stripTags(
      firstMatch(article, /<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/) ?? "",
    );
    const language = stripTags(
      firstMatch(article, /<span[^>]*itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/) ?? "",
    );
    const starsHref = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const totalStars = stripTags(
      firstMatch(article, new RegExp(`<a[^>]+href="/${starsHref}/stargazers"[\\s\\S]*?>([\\s\\S]*?)<\\/a>`)) ?? "",
    );
    const forks = stripTags(
      firstMatch(article, new RegExp(`<a[^>]+href="/${starsHref}/forks"[\\s\\S]*?>([\\s\\S]*?)<\\/a>`)) ?? "",
    );
    const starsToday = compactWhitespace(
      firstMatch(article, /([\d,]+)\s+stars?\s+today/i) ?? "",
    );

    repos.push({
      fullName,
      url: `https://github.com/${fullName}`,
      description,
      language: language || undefined,
      totalStars: totalStars || undefined,
      forks: forks || undefined,
      starsToday: starsToday || undefined,
    });

    if (repos.length >= limit) break;
  }

  return repos;
}

function getDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getMinutesInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function parseTimeToMinutes(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isAihotAiNewsEnabled(): boolean {
  return (process.env.AI_NEWS_PROVIDER ?? "aihot").toLowerCase() === "aihot";
}

function getAihotDigestMode(): "daily" | "selected" {
  return (process.env.AIHOT_DIGEST_MODE ?? "daily").toLowerCase() === "selected"
    ? "selected"
    : "daily";
}

export function getAiNewsDigestCacheDate(date: Date, timezone: string): string {
  const today = getDateInTimezone(date, timezone);
  if (!isAihotAiNewsEnabled() || getAihotDigestMode() !== "daily") return today;

  const readyAt = parseTimeToMinutes(process.env.AIHOT_DAILY_READY_TIME ?? DEFAULT_AIHOT_DAILY_READY_TIME);
  if (readyAt === null) return today;

  return getMinutesInTimezone(date, timezone) >= readyAt
    ? today
    : getDateInTimezone(new Date(date.getTime() - 24 * 60 * 60 * 1000), timezone);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryHttpStatus(status: number, retryRateLimit: boolean): boolean {
  if (status === 429) return retryRateLimit;
  return status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }
  return undefined;
}

class FetchHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "FetchHttpError";
  }
}

async function fetchText(
  url: string,
  headers?: HeadersInit,
  attempts = 3,
  retryBaseMs = 1000,
  options: { retryRateLimit?: boolean } = {},
): Promise<string> {
  let lastError: unknown;
  const retryRateLimit = options.retryRateLimit ?? true;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "learn-digest/1.0",
          ...headers,
        },
      });
      if (response.ok) {
        return response.text();
      }
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const error = new FetchHttpError(
        `GET ${url} failed: ${response.status}`,
        response.status,
        retryAfterMs,
      );
      if (!shouldRetryHttpStatus(response.status, retryRateLimit) || attempt === attempts) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      lastError = error;
      if (
        error instanceof FetchHttpError &&
        !shouldRetryHttpStatus(error.status, retryRateLimit)
      ) {
        break;
      }
      if (attempt === attempts) break;
    }

    const retryAfterMs =
      lastError instanceof FetchHttpError ? lastError.retryAfterMs : undefined;
    await sleep(Math.min(retryAfterMs ?? retryBaseMs * attempt, 60_000));
  }

  throw lastError instanceof Error ? lastError : new Error(`GET ${url} failed`);
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  return JSON.parse(
    await fetchText(url, {
      Accept: "application/json",
      ...headers,
    }),
  ) as T;
}

function getDigestSummaryClient(): OpenAI | null {
  if (digestSummaryClient !== undefined) return digestSummaryClient;
  if (!process.env.LLM_API_KEY) {
    digestSummaryClient = null;
    return digestSummaryClient;
  }
  digestSummaryClient = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_API_BASE_URL || undefined,
    timeout: getLlmTimeoutMs(),
  });
  return digestSummaryClient;
}

function getGithubHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function getDigestAiConcurrency(): number {
  return Math.max(
    1,
    Number(process.env.DIGEST_AI_CONCURRENCY ?? DEFAULT_DIGEST_AI_CONCURRENCY),
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function rewriteWithDigestAi(
  text: string,
  instruction: string,
  maxChars: number,
): Promise<string | undefined> {
  const client = getDigestSummaryClient();
  if (!client) return undefined;

  const completion = await client.chat.completions.create({
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    temperature: 0.15,
    messages: [
      {
        role: "system",
        content:
          "You rewrite English AI digest material into concise, accurate Chinese. Return plain text only.",
      },
      {
        role: "user",
        content: [
          instruction,
          "不要添加原文没有的信息，不要输出 Markdown，不要输出标题。",
          "",
          truncate(text, maxChars),
        ].join("\n"),
      },
    ],
  });

  const content = compactWhitespace(completion.choices[0]?.message?.content ?? "");
  return content || undefined;
}

async function fetchGithubReadme(repo: GithubRepo): Promise<string | undefined> {
  const [owner, repoName] = repo.fullName.split("/");
  if (!owner || !repoName) return undefined;

  try {
    return await fetchText(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/readme`,
      getGithubHeaders("application/vnd.github.raw"),
      2,
    );
  } catch (error) {
    console.warn(`[Digest] GitHub README fetch failed for ${repo.fullName}`, error);
    return undefined;
  }
}

async function summarizeGithubReadme(repo: GithubRepo, readme: string): Promise<string | undefined> {
  return rewriteWithDigestAi(
    buildGithubReadmeSummaryText(repo, readme),
    getGithubReadmeSummaryInstruction(),
    getGithubReadmeSummaryMaxChars() + 500,
  );
}

async function enrichGithubReposWithAiSummaries(repos: GithubRepo[]): Promise<GithubRepo[]> {
  const client = getDigestSummaryClient();
  if (!client || repos.length === 0) return repos;

  const concurrency = Math.max(
    1,
    Number(process.env.GITHUB_README_SUMMARY_CONCURRENCY ?? DEFAULT_README_SUMMARY_CONCURRENCY),
  );
  return mapWithConcurrency(repos, concurrency, async (repo) => {
    try {
      const readme = await fetchGithubReadme(repo);
      const aiSummary = readme ? await summarizeGithubReadme(repo, readme) : undefined;
      return { ...repo, aiSummary };
    } catch (error) {
      console.warn(`[Digest] GitHub README summary failed for ${repo.fullName}`, error);
      return repo;
    }
  });
}

export async function fetchGithubTrendingDigest(
  limit = getDigestItemLimit(),
): Promise<string[]> {
  const itemLimit = clampDigestItemLimit(limit);
  const language = process.env.GITHUB_TRENDING_LANGUAGE ?? "";
  const path = language ? `/${encodeURIComponent(language)}` : "";
  const url = `https://github.com/trending${path}?since=daily`;

  try {
    const html = await fetchText(url, {
      Accept: "text/html",
    });
    const repos = parseGithubTrending(html, itemLimit);
    if (repos.length > 0) {
      const summarizedRepos = await enrichGithubReposWithAiSummaries(repos);
      return formatGithubOverviewPages(summarizedRepos);
    }
  } catch (error) {
    console.warn("[Digest] GitHub Trending scrape failed, falling back to Search API", error);
  }

  const fallbackRepos = await fetchGithubSearchFallback(itemLimit);
  return formatGithubOverviewPages(fallbackRepos);
}

async function fetchGithubSearchFallback(limit: number): Promise<GithubRepo[]> {
  const timezone = process.env.SCHEDULER_TIMEZONE ?? "Asia/Shanghai";
  const since = getDateInTimezone(new Date(Date.now() - 24 * 60 * 60 * 1000), timezone);
  const query = process.env.GITHUB_TRENDING_SEARCH_QUERY ?? `created:>=${since} stars:>10 fork:false`;
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(limit));

  const headers: HeadersInit = {
    ...getGithubHeaders("application/vnd.github+json"),
  };

  const response = await fetch(url, {
    headers: {
      "User-Agent": "learn-digest/1.0",
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub Search API failed: ${response.status}`);
  }
  const data = (await response.json()) as { items?: GithubSearchRepo[] };
  const repos = (data.items ?? []).slice(0, limit).map((repo) => {
    const topics = repo.topics?.length ? `topics: ${repo.topics.slice(0, 5).join(", ")}` : null;
    return {
      fullName: repo.full_name,
      url: repo.html_url,
      description: [repo.description, topics].filter(Boolean).join(" "),
      language: repo.language ?? undefined,
      totalStars: String(repo.stargazers_count),
      forks: String(repo.forks_count),
    };
  });
  const summarizedRepos = await enrichGithubReposWithAiSummaries(repos);
  return summarizedRepos;
}

function parseRssItems(xml: string, source: string): DigestItem[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) ?? [];
  return blocks.map((block) => {
    const title = stripTags(firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/) ?? "Untitled");
    const description = stripTags(
      firstMatch(block, /<description[^>]*>([\s\S]*?)<\/description>/) ??
        firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/) ??
        firstMatch(block, /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/) ??
        ""
    );
    const link =
      stripTags(firstMatch(block, /<link[^>]*>([\s\S]*?)<\/link>/) ?? "") ||
      decodeHtml(firstMatch(block, /<link[^>]+href="([^"]+)"/) ?? "");
    const pubDate = stripTags(
      firstMatch(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) ??
        firstMatch(block, /<published[^>]*>([\s\S]*?)<\/published>/) ??
        firstMatch(block, /<updated[^>]*>([\s\S]*?)<\/updated>/) ??
        ""
    );
    return {
      title,
      url: link || undefined,
      source,
      summary: description || "No summary provided.",
      meta: pubDate ? `published: ${pubDate}` : undefined,
    };
  });
}

function pickAihotDailyItems(daily: AihotDailyResponse, limit: number): DigestItem[] {
  const sections = (daily.sections ?? [])
    .map((section) => ({
      label: section.label ?? "AI HOT",
      items: section.items ?? [],
    }))
    .filter((section) => section.items.length > 0);
  const picked: DigestItem[] = [];

  for (let index = 0; picked.length < limit; index += 1) {
    let added = false;
    for (const section of sections) {
      const item = section.items[index];
      if (!item) continue;
      picked.push({
        title: item.title ?? "Untitled",
        url: item.sourceUrl,
        source: item.sourceName ?? "AI HOT",
        summary: item.summary || "No summary provided.",
        meta: [`日报: ${daily.date ?? ""}`, `分类: ${section.label}`]
          .filter((value) => !value.endsWith(": "))
          .join(" | "),
      });
      added = true;
      if (picked.length >= limit) break;
    }
    if (!added) break;
  }

  return picked;
}

async function fetchAihotDailyItems(limit: number, digestDate?: string): Promise<DigestItem[]> {
  const baseUrl = getAihotApiBaseUrl();
  const path = digestDate
    ? `/api/public/daily/${encodeURIComponent(digestDate)}`
    : "/api/public/daily";
  const daily = await fetchJson<AihotDailyResponse>(`${baseUrl}${path}`, getAihotHeaders());
  return pickAihotDailyItems(daily, limit);
}

async function fetchAihotSelectedItems(limit: number): Promise<DigestItem[]> {
  const baseUrl = getAihotApiBaseUrl();
  const url = new URL(`${baseUrl}/api/public/items`);
  url.searchParams.set("mode", "selected");
  url.searchParams.set("take", String(limit));

  const response = await fetchJson<AihotSelectedResponse>(url.toString(), getAihotHeaders());
  return (response.items ?? [])
    .slice(0, limit)
    .map((item) => ({
      title: item.title ?? "Untitled",
      url: item.url,
      source: item.source ?? "AI HOT",
      summary: item.summary || "No summary provided.",
      meta: item.publishedAt ? `published: ${item.publishedAt}` : item.category ? `分类: ${item.category}` : undefined,
    }));
}

async function fetchAihotItems(limit: number, digestDate?: string): Promise<DigestItem[]> {
  if (getAihotDigestMode() === "selected") {
    return fetchAihotSelectedItems(limit);
  }
  return fetchAihotDailyItems(limit, digestDate);
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function fetchAiNewsFromRss(limit: number): Promise<DigestItem[]> {
  const feeds = (process.env.AI_NEWS_RSS_FEEDS ?? DEFAULT_AI_NEWS_FEEDS.join(","))
    .split(",")
    .map((feed) => feed.trim())
    .filter(Boolean);

  const results = await Promise.allSettled(
    feeds.map(async (feed) => parseRssItems(await fetchText(feed), hostnameFromUrl(feed)))
  );
  return results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .slice(0, limit);
}

async function fetchAiNewsFromHackerNews(limit: number): Promise<DigestItem[]> {
  const since = Math.floor(Date.now() / 1000) - 36 * 60 * 60;
  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.searchParams.set("query", process.env.AI_NEWS_HN_QUERY ?? "artificial intelligence");
  url.searchParams.set("tags", "story");
  url.searchParams.set("numericFilters", `created_at_i>${since},points>20`);
  url.searchParams.set("hitsPerPage", String(limit));

  const response = await fetch(url, {
    headers: { "User-Agent": "learn-digest/1.0" },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { hits?: HnHit[] };
  return (data.hits ?? []).map((hit) => ({
    title: hit.title ?? hit.story_title ?? "Untitled",
    url: hit.url ?? hit.story_url,
    source: "Hacker News",
    summary: "High-signal Hacker News discussion related to artificial intelligence.",
    meta: [`points: ${hit.points ?? 0}`, hit.author ? `author: ${hit.author}` : null]
      .filter(Boolean)
      .join(" | "),
  }));
}

async function translateAiNewsItems(items: DigestItem[]): Promise<DigestItem[]> {
  if (!getDigestSummaryClient() || items.length === 0) return items;
  const maxChars = Number(process.env.AI_NEWS_TRANSLATION_MAX_CHARS ?? DEFAULT_NEWS_TRANSLATION_MAX_CHARS);

  return mapWithConcurrency(items, getDigestAiConcurrency(), async (item) => {
    try {
      const translatedSummary = await rewriteWithDigestAi(
        item.summary,
        "请把下面的 AI 新闻摘要翻译并轻度改写成中文，控制在 80-140 个中文字符，保留关键主体、动作和影响。",
        maxChars,
      );
      return translatedSummary ? { ...item, summary: translatedSummary } : item;
    } catch (error) {
      console.warn(`[Digest] AI news translation failed for ${item.title}`, error);
      return item;
    }
  });
}

export async function fetchAiNewsDigest(
  limit = getDigestItemLimit(),
  options: { digestDate?: string } = {},
): Promise<string[]> {
  const itemLimit = clampDigestItemLimit(limit);
  if (isAihotAiNewsEnabled()) {
    try {
      const items = await fetchAihotItems(itemLimit, options.digestDate);
      if (items.length > 0) return formatAiNewsOverviewPages(items);
    } catch (error) {
      console.warn("[Digest] AIHOT fetch failed, falling back to RSS/HN", error);
    }
  }

  const [rssItems, hnItems] = await Promise.all([
    fetchAiNewsFromRss(Math.ceil(itemLimit * 0.7)),
    fetchAiNewsFromHackerNews(Math.floor(itemLimit * 0.3)),
  ]);

  const seen = new Set<string>();
  const items = [...rssItems, ...hnItems]
    .filter((item) => {
      const key = `${item.title}|${item.url ?? ""}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, itemLimit);
  const translatedItems = await translateAiNewsItems(items);
  return formatAiNewsOverviewPages(translatedItems);
}

function parseArxivPapers(xml: string): ArxivPaper[] {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/g) ?? [];
  return entries.map((entry) => {
    const id = stripTags(firstMatch(entry, /<id[^>]*>([\s\S]*?)<\/id>/) ?? "");
    const title = stripTags(firstMatch(entry, /<title[^>]*>([\s\S]*?)<\/title>/) ?? "Untitled");
    const summary = stripTags(firstMatch(entry, /<summary[^>]*>([\s\S]*?)<\/summary>/) ?? "");
    const published = stripTags(firstMatch(entry, /<published[^>]*>([\s\S]*?)<\/published>/) ?? "");
    const authors = [...entry.matchAll(/<author\b[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);
    const primaryCategory =
      firstMatch(entry, /<arxiv:primary_category[^>]+term="([^"]+)"/) ??
      firstMatch(entry, /<category[^>]+term="([^"]+)"/);

    return {
      title,
      url: id,
      authors,
      summary,
      published: published || undefined,
      primaryCategory,
    };
  }).filter((paper): paper is ArxivPaper => Boolean(paper.url));
}

async function translateArxivPapers(papers: ArxivPaper[]): Promise<ArxivPaper[]> {
  if (!getDigestSummaryClient() || papers.length === 0) return papers;
  const maxChars = Number(process.env.ARXIV_TRANSLATION_MAX_CHARS ?? DEFAULT_ARXIV_TRANSLATION_MAX_CHARS);

  return mapWithConcurrency(papers, getDigestAiConcurrency(), async (paper) => {
    try {
      const translatedSummary = await rewriteWithDigestAi(
        paper.summary,
        "请把下面的论文 Abstract 翻译并压缩成中文，控制在 160-260 个中文字符，保留研究问题、方法和主要贡献；论文标题不用翻译。",
        maxChars,
      );
      return translatedSummary ? { ...paper, summary: translatedSummary } : paper;
    } catch (error) {
      console.warn(`[Digest] arXiv abstract translation failed for ${paper.title}`, error);
      return paper;
    }
  });
}

export async function fetchArxivAiPapersDigest(
  limit = getDigestItemLimit(),
): Promise<string[]> {
  const itemLimit = clampDigestItemLimit(limit);
  const query =
    process.env.ARXIV_AI_SEARCH_QUERY ??
    (process.env.ARXIV_AI_CATEGORIES ?? DEFAULT_ARXIV_AI_CATEGORIES.join(","))
      .split(",")
      .map((category) => category.trim())
      .filter(Boolean)
      .map((category) => `cat:${category}`)
      .join(" OR ");

  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", query);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(itemLimit));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  const xml = await fetchText(
    url.toString(),
    {
      Accept: "application/atom+xml, application/xml",
    },
    getPositiveIntegerEnv("ARXIV_FETCH_ATTEMPTS", DEFAULT_ARXIV_FETCH_ATTEMPTS),
    getPositiveIntegerEnv("ARXIV_RETRY_BASE_MS", DEFAULT_ARXIV_RETRY_BASE_MS),
    { retryRateLimit: false },
  );
  const papers = parseArxivPapers(xml).slice(0, itemLimit);
  const translatedPapers = await translateArxivPapers(papers);
  return formatArxivOverviewPages(translatedPapers);
}

export async function fetchDigestItems(
  type: DigestType,
  limit = getDigestItemLimit(),
  options: { digestDate?: string } = {},
): Promise<string[]> {
  const itemLimit = clampDigestItemLimit(limit);
  if (type === "GITHUB_TRENDING") {
    return fetchGithubTrendingDigest(itemLimit);
  }
  if (type === "AI_NEWS") {
    return fetchAiNewsDigest(itemLimit, options);
  }
  if (type === "ARXIV_AI_PAPERS") {
    return fetchArxivAiPapersDigest(itemLimit);
  }
  return [];
}
