# Design

<!-- impeccable:design-schema 1 -->

## Direction

DailyBits is a user-facing learning catalogue, not an operations console. Cool white surfaces, clear blue actions and compact metadata support choosing useful learning material. No invented activity visualization, technical-looking identifier or filler description should compete with actual content. Product controls remain familiar and predictable.

The interface is desktop-first and content-first. A light masthead keeps the product calm while blue text, underlines and primary buttons mark navigation and action. Discovery starts with unboxed channel tabs and the real catalogue, never a decorative product pitch or a loud segmented control.

## Tokens

- `--primary`, `--accent`: stable cobalt for actions, active routes and focus.
- `--surface-ink`, `--surface-night`: dark ink reserved for editor and high-contrast content surfaces.
- `--surface-coral`, `--surface-citrine`, `--surface-sky`: content and status accents used sparingly.
- `--surface-paper`, `--surface-field`: cool white reading and editing surfaces.
- `--radius`: shared radius for panels, cards, forms, and tab controls.

## Components

- `Header`: light masthead, blue brand mark, text-led navigation and predictable identity actions.
- `HomeFrame`: one-line heading and actions, unboxed channel switcher, compact search and real content directly below. No hero, redundant dashboard link or decorative date.
- `PageHeader`: unframed, concise heading and actions.
- `WorkbenchPanel`: a framed editing tool; ordinary sections remain unframed.
- `RequestState`, `AuthenticationState`: explicit loading, retry, login and permission states.
- `MetricLine`: dashboard and admin summary cells.
- `LearningCatalogCard`: shared question/knowledge entry with a full-card title link, real description, creator, inline counts and a schedule footer. Subscribe is the single primary action, isolated from the stretched link. Missing descriptions stay absent.
- `DigestSubscriptionList`: compact channel cards. Scheduling expands inline only after subscribing or editing; cancel restores the saved time and focus returns to the initiating button after saving finishes. Unknown subscriber counts are never presented as zero.
- `stream-toolbar`, `empty-slate`: shared search and recovery surfaces.

Base controls continue to use the existing shadcn/Base UI stack. Icons use `lucide-react`. No paid service or external account is required.

## Motion

A short fade accompanies route entry. No blur, decorative chart animation or hover lift. Reduced motion is respected; loading skeletons match catalogue columns.

## Page Coverage

- Home: compact title, separate card-preview action, creation-only menu, question/knowledge/news-and-trends tabs, search, content cards and explicit recovery states.
- Dashboard: compact stats and separate tabs for subscriptions, created content and history.
- Create question bank and create knowledge bank: form plus live summary panel.
- Detail and edit pages: aligned columns with non-stretching subscription controls and compact editor headers.
- Digest preview: cached real content rendered by react-markdown/remark-gfm using the exact Messaging payload formatter. No fictional card actions or fabricated samples.
- Admin: Recharts trends, answer/subscription rankings, explicit permission/error states and delivery health.
- Admin overview and group page: same headers, panels, metrics, and overflow behavior.

## Boundaries

The redesign preserves routes, APIs, Auth Hub behavior, Directory lookup, schedule semantics, card-service integration, and real Chinese copy. Styling should not change push logic or content visibility rules. For future changes, keep desktop first, but avoid page-level horizontal overflow on narrow windows.
