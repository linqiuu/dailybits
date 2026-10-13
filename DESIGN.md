# Design

<!-- impeccable:design-schema 1 -->

## Direction

DailyBits is a user-facing learning website, not an operations console. The interface should feel like a polished daily discovery desk: users find useful material, subscribe to a rhythm, create their own banks, and check progress without reading documentation.

The visual direction is compact, content-first learning. White surfaces, cobalt actions and teal accents provide clear hierarchy without glowing backgrounds. Navigation is a stable top bar, content sections are unframed, cards use 8px corners and inline metadata. Discovery starts with channel tabs and the real catalogue, not a decorative hero.

## Tokens

- `--primary`, `--accent`: cobalt focus, primary actions, selected tabs, and keyboard rings.
- `--surface-ink`, `--surface-night`: dark editor headers and high-contrast surfaces.
- `--surface-mint`: success, creation, and calm learning accents.
- `--surface-coral`, `--surface-citrine`: digest and warning accents used sparingly.
- `--surface-sky`, `--surface-field`: luminous learning backgrounds and empty states.
- `--radius`: shared radius for panels, cards, forms, and tab controls.

## Components

- `Header`: stable top navigation with a recognizable brand and predictable actions.
- `HomeFrame`: compact command bar plus horizontal channel switcher, with real content directly below.
- `PageHeader`: unframed, concise heading and actions.
- `WorkbenchPanel`: unframed content section; only repeated items and actual tools get cards.
- `RequestState`, `AuthenticationState`: explicit loading, retry, login and permission states.
- `MetricLine`: dashboard and admin summary cells.
- `content-card`, `stream-toolbar`, `empty-slate`: shared classes for discovery cards, search bars, and empty states.

Base controls continue to use the existing shadcn/Base UI stack. Icons use `lucide-react`. No paid service or external account is required.

## Motion

Motion is restrained to page entry and control state transitions. Cards do not lift or resize on hover. Reduced motion is respected.

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
