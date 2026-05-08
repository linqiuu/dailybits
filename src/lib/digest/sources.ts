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

const DEFAULT_AI_NEWS_FEEDS = [
  "https://openai.com/news/rss.xml",
  "https://news.mit.edu/rss/topic/artificial-intelligence2",
];
const DEFAULT_ARXIV_AI_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "stat.ML"];
const DEFAULT_README_SUMMARY_MAX_CHARS = 5000;
const DEFAULT_README_SUMMARY_CONCURRENCY = 2;
const DEFAULT_DIGEST_AI_CONCURRENCY = 3;
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

function formatRepo(repo: GithubRepo): string {
  const stars = repo.totalStars
    ? `⭐ ${repo.totalStars}${repo.starsToday ? ` (🚀今日 +${repo.starsToday})` : ""}`
    : repo.starsToday
      ? `🚀今日 +${repo.starsToday}`
      : null;
  const meta = [repo.language, stars, repo.forks ? `🍴 ${repo.forks}` : null]
    .filter(Boolean)
    .join(" | ");

  return [
    `📦 **${markdownLink(repo.fullName, repo.url)}**`,
    meta ? `*${meta}*` : null,
    `💡**AI 总结**：${repo.aiSummary || repo.description || "No summary provided."}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatDigestItem(item: DigestItem): string {
  const publishedRaw = item.meta?.match(/^published:\s*(.+)$/i)?.[1];
  const published = formatDisplayDate(publishedRaw);
  const meta = [
    `来源: ${item.source ?? "unknown"}`,
    published ? `发布于: ${published}` : item.meta,
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `📰 **${markdownLink(item.title, item.url)}**`,
    meta,
    `**摘要提取**：${item.summary}`,
  ].join("\n");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
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

function formatDisplayDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function fetchText(
  url: string,
  headers?: HeadersInit,
  attempts = 3,
  retryBaseMs = 1000,
): Promise<string> {
  let lastError: unknown;
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
      if (!shouldRetryStatus(response.status) || attempt === attempts) {
        throw new Error(`GET ${url} failed: ${response.status}`);
      }
      lastError = new Error(`GET ${url} failed: ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }

    await sleep(retryBaseMs * attempt);
  }

  throw lastError instanceof Error ? lastError : new Error(`GET ${url} failed`);
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
    "请基于这个 GitHub 项目的 README，用 80-120 个中文字符总结：它解决什么问题、核心能力、适合谁关注。",
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

export async function fetchGithubTrendingDigest(limit = 10): Promise<string[]> {
  const language = process.env.GITHUB_TRENDING_LANGUAGE ?? "";
  const path = language ? `/${encodeURIComponent(language)}` : "";
  const url = `https://github.com/trending${path}?since=daily`;

  try {
    const html = await fetchText(url, {
      Accept: "text/html",
    });
    const repos = parseGithubTrending(html, limit);
    if (repos.length > 0) {
      const summarizedRepos = await enrichGithubReposWithAiSummaries(repos);
      return summarizedRepos.map(formatRepo);
    }
  } catch (error) {
    console.warn("[Digest] GitHub Trending scrape failed, falling back to Search API", error);
  }

  return fetchGithubSearchFallback(limit);
}

async function fetchGithubSearchFallback(limit: number): Promise<string[]> {
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
  return summarizedRepos.map(formatRepo);
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

export async function fetchAiNewsDigest(limit = 10): Promise<string[]> {
  const [rssItems, hnItems] = await Promise.all([
    fetchAiNewsFromRss(Math.ceil(limit * 0.7)),
    fetchAiNewsFromHackerNews(Math.floor(limit * 0.3)),
  ]);

  const seen = new Set<string>();
  const items = [...rssItems, ...hnItems]
    .filter((item) => {
      const key = `${item.title}|${item.url ?? ""}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  const translatedItems = await translateAiNewsItems(items);
  return translatedItems.map(formatDigestItem);
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

function formatArxivPaper(paper: ArxivPaper): string {
  const authors = paper.authors.length
    ? `${paper.authors.slice(0, 4).join(", ")}${paper.authors.length > 4 ? ", et al." : ""}`
    : null;
  const meta = [
    authors,
    paper.primaryCategory ? `分类: ${paper.primaryCategory}` : null,
    paper.published ? `发布时间: ${paper.published.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `📄 **${markdownLink(paper.title, paper.url)}**`,
    "",
    meta,
    "",
    `**Abstract**: ${truncate(paper.summary || "No abstract provided.", 520)}`,
  ]
    .filter(Boolean)
    .join("\n");
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

export async function fetchArxivAiPapersDigest(limit = 10): Promise<string[]> {
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
  url.searchParams.set("max_results", String(limit));
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");

  const xml = await fetchText(
    url.toString(),
    {
      Accept: "application/atom+xml, application/xml",
    },
    5,
    10000,
  );
  const papers = parseArxivPapers(xml).slice(0, limit);
  const translatedPapers = await translateArxivPapers(papers);
  return translatedPapers.map(formatArxivPaper);
}

export async function fetchDigestItems(type: DigestType, limit = 10): Promise<string[]> {
  if (type === "GITHUB_TRENDING") {
    return fetchGithubTrendingDigest(limit);
  }
  if (type === "AI_NEWS") {
    return fetchAiNewsDigest(limit);
  }
  if (type === "ARXIV_AI_PAPERS") {
    return fetchArxivAiPapersDigest(limit);
  }
  return [];
}
