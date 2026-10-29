# Design

<!-- impeccable:design-schema 1 -->

## Direction

DailyBits is a user-facing learning catalogue, not an operations console. It borrows the confidence and information density of independent record catalogues and editorial indexes: warm paper, black ink, compact identifiers, vivid signal colors and a rhythmic bar motif. Product controls remain familiar and predictable.

The interface is desktop-first and content-first. The black masthead stays stable while the warm paper workspace carries discovery, creation and reporting. Signal lime marks the current route and primary moments; coral, blue and yellow distinguish content or status only when useful. Discovery starts with channel tabs and the real catalogue, never a decorative product pitch.

## Tokens

- `--primary`, `--surface-ink`, `--surface-night`: black ink, actions, navigation and editor headers.
- `--accent`, `--surface-mint`: signal lime for active routes, creation and authored interaction moments.
- `--surface-coral`, `--surface-citrine`, `--surface-sky`: content and status accents used sparingly.
- `--surface-paper`, `--surface-field`: warm reading and editing surfaces.
- `--radius`: shared radius for panels, cards, forms, and tab controls.

## Components

- `Header`: black masthead, signal mark, stable navigation and predictable identity actions.
- `HomeFrame`: compact editorial statement plus horizontal channel switcher, with real content directly below.
- `PageHeader`: unframed, concise heading and actions.
- `WorkbenchPanel`: unframed content section; only repeated items and actual tools get cards.
- `RequestState`, `AuthenticationState`: explicit loading, retry, login and permission states.
- `MetricLine`: dashboard and admin summary cells.
- `content-card`, `catalog-meta`, `signal-bars`: dense catalogue entries with stable metadata and an activity signature.
- `stream-toolbar`, `empty-slate`: shared search and recovery surfaces.

Base controls continue to use the existing shadcn/Base UI stack. Icons use `lucide-react`. No paid service or external account is required.

## Motion

One clipped, blur-to-sharp page reveal establishes the publishing surface. Cards never lift or resize; their signal bars change color on hover without shifting layout. Reduced motion is respected.

## Page Coverage

- Home: compact command bar, my-content action, create menu, horizontal channel tabs, search, content cards, and compact empty states.
- Dashboard: compact stats and separate tabs for subscriptions, created content and history.
- Create question bank and create knowledge bank: form plus live summary panel.
- Detail and edit pages: aligned columns with non-stretching subscription controls and compact editor headers.
- Digest preview: cached real content rendered by react-markdown/remark-gfm using the exact Messaging payload formatter. No fictional card actions or fabricated samples.
- Admin: Recharts trends, answer/subscription rankings, explicit permission/error states and delivery health.
- Admin overview and group page: same headers, panels, metrics, and overflow behavior.

## Boundaries

The redesign preserves routes, APIs, Auth Hub behavior, Directory lookup, schedule semantics, card-service integration, and real Chinese copy. Styling should not change push logic or content visibility rules. For future changes, keep desktop first, but avoid page-level horizontal overflow on narrow windows.
