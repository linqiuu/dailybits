# Daily Digest Subscriptions

## Scope

This adds separate daily digest subscriptions next to the existing question-bank subscriptions.

Supported digest types:

- `GITHUB_TRENDING`: fetches `github.com/trending?since=daily`, parses the public Trending page, and falls back to GitHub Search API when scraping fails.
- `AI_NEWS`: fetches curated RSS feeds plus high-signal Hacker News search results.
- `ARXIV_AI_PAPERS`: fetches the arXiv API sorted by latest submitted date for AI-related categories.

Each push payload uses a string list. Each string is Markdown and can be rendered independently:

```json
{
  "receiver": "user-or-group-id",
  "title": "GitHub Trending Daily",
  "items": [
    "📦 **[owner/repo](https://github.com/owner/repo)**\n*TypeScript | ⭐ 1234 (🚀今日 +56) | 🍴 78*\n💡**AI 总结**：..."
  ],
  "digestType": "GITHUB_TRENDING",
  "digestDate": "2026-05-07"
}
```

Subscribe to arXiv AI papers:

```http
POST /api/digest-subscriptions
Content-Type: application/json

{
  "digestType": "ARXIV_AI_PAPERS",
  "pushTimes": ["08:30"]
}
```

## API

Create a digest subscription:

```http
POST /api/digest-subscriptions
Content-Type: application/json

{
  "digestType": "GITHUB_TRENDING",
  "pushTimes": ["09:00"]
}
```

Create a group digest subscription:

```http
POST /api/digest-subscriptions
Content-Type: application/json

{
  "targetType": "GROUP",
  "targetId": "group-chat-id",
  "digestType": "AI_NEWS",
  "pushTimes": ["09:30"]
}
```

List current user's active digest subscriptions:

```http
GET /api/digest-subscriptions/mine
```

Update push times:

```http
PATCH /api/digest-subscriptions/:id
Content-Type: application/json

{
  "pushTimes": ["09:00", "18:00"]
}
```

Delete:

```http
DELETE /api/digest-subscriptions/:id
```

Development-only manual trigger:

```http
POST /api/digest/trigger
Content-Type: application/json

{
  "digestType": "AI_NEWS"
}
```

## Environment

```env
DIGEST_ITEM_LIMIT="10"
GITHUB_TOKEN=""
GITHUB_TRENDING_LANGUAGE=""
GITHUB_TRENDING_SEARCH_QUERY=""
GITHUB_README_SUMMARY_MAX_CHARS="12000"
GITHUB_README_SUMMARY_CONCURRENCY="2"
DIGEST_AI_CONCURRENCY="3"
AI_NEWS_TRANSLATION_MAX_CHARS="1800"
ARXIV_TRANSLATION_MAX_CHARS="3500"
AI_NEWS_RSS_FEEDS="https://openai.com/news/rss.xml,https://news.mit.edu/rss/topic/artificial-intelligence2"
AI_NEWS_HN_QUERY="artificial intelligence"
ARXIV_AI_CATEGORIES="cs.AI,cs.LG,cs.CL,cs.CV,stat.ML"
ARXIV_AI_SEARCH_QUERY=""
```

`GITHUB_TOKEN` is optional but recommended in production to increase GitHub API rate limits for the fallback path and README fetches. GitHub Trending items fetch each repo README and use the configured LLM (`LLM_API_KEY`, `LLM_API_BASE_URL`, `LLM_MODEL`) to generate a concise summary.

`AI_NEWS_RSS_FEEDS` is comma-separated. Prefer official or editorial RSS feeds. Good defaults are OpenAI News and MIT News Artificial Intelligence; Hacker News is added as a supplemental API source for timely community signals. News summaries are translated into Chinese with the configured LLM before pushing.

`ARXIV_AI_CATEGORIES` is comma-separated. `ARXIV_AI_SEARCH_QUERY` can override it with a raw arXiv query, for example `cat:cs.AI OR cat:cs.LG`. Paper titles stay in the original language, while abstracts are translated and compressed into Chinese with the configured LLM.

## Runtime

Run database migration, then start the scheduler as before:

```bash
npx prisma migrate deploy
npm run scheduler
```

Digest pushes are not skipped on weekends or holidays. Existing question-bank pushes still obey `SKIP_NON_WORKING_DAYS`.

## Fetching and caching

Digest subscriptions accept exactly one daily push time. Users can choose different times, but the source content is cached by `digestType + digestDate` in `DigestCache`.

Scheduler behavior:

- Every minute, find active digest subscriptions whose single `pushTimes[0]` matches the current `HH:MM`.
- For each digest type, read today's `DigestCache` first.
- If there is no cache row, fetch the external source once, store `items: string[]`, then push.
- If the cache row still contains the old non-Markdown digest format, refresh it before pushing.
- If there is already a cache row, push the cached `items` without calling the external source again.
- Pushes are processed sequentially in the current scheduler process. Each successful target gets a `DigestPushLog` row keyed by `targetType + targetId + digestType + digestDate`, so a target will not receive the same digest twice on the same date.
