---
name: app-plan
description: PLAN.md format for specifying a web app before building it
version: 22
---

# App plan skill

When asked to plan an application, produce a PLAN.md that opens with this title line,
then has exactly these sections:

```
# <App Name> Plan — <one-line description>
```

The title is the FIRST line of the file and it names the app AND says what the app is,
in one line:

- **Before the em dash**: the app's own display name followed by the word `Plan` — the
  same name as the `Name:` bullet below, verbatim (`ITSM App` → `# ITSM App Plan — …`).
- **After the em dash**: a description of the app in ONE short noun phrase, 3-8 words,
  Title Case, no trailing period. Name the app's actual subject matter and its one
  defining capability — it is the same substance as the `## APP` one-line summary,
  compressed. `Incident Management with Role-Based Auth`, not `A Useful Internal Tool`.

```
# ITSM App Plan — Incident Management with Role-Based Auth
# Meridian Portal Plan — Client Billing and Invoice Tracking
```

The plan is shown to the user as a document, so this line is its heading on screen. A
bare `# Plan`, a name that differs from `Name:`, a missing description, or a generic one
("A Web App", "Modern Dashboard") is wrong.

## APP
- First bullet is exactly `Name: <display name>` — Title Case, 1-3 words (e.g. `Name: ITSM Hub`,
  `Name: Meridian Portal`). It is shown as the app's title in the UI — never a kebab-case or
  lowercase slug.
- Second bullet is exactly `Tagline: <sentence>`: what the app does for the person, plain words, at most 70 characters, no connections, buttons or tech (e.g. `Tagline: Store emails and visit reports, side by side`). The connect modal shows it under the name.
- One-line summary, target users, primary device (desktop/mobile).

## FEATURES
- Each feature: name, 2-4 sentence spec, acceptance criteria. Number them. Be concrete —
  "add expense with amount/category/date/note, validate amount > 0" not "manage expenses".
- **Never pin a date or a window.** Say how a date is derived from the run date ("the next 90
  days"), never what it currently is ("Thursday 08 Oct 2026") — one named here becomes a
  constant in the app.
- **A control the brief gives to some people only** carries, in its feature's acceptance
  criteria, the permission group id and key the brief gave for it — and the automation that
  runs it, when the brief names one — as written: "Approve shows only to holders of key
  `approve_request` in group `<group id>`, and runs automation `<automation id>`".
- **A feature where users draw an area on a map and ask an AI agent about it** says it uses the
  prebuilt `<MapAreaTools>` (MAPS → AREA TOOLS): the points it counts, the metric, the agent
  that answers, and what the screen does with the selection. Never draw modes, vertex handles,
  a containment test or a selection panel: the component has them, and a feature that lists
  them gets them built twice. With no agent to answer, the drawing is hand-rolled and the
  feature spells out its draw modes and selection.

## SCREENS
- Every screen/view with its purpose and what's on it. Include empty states.
- When more than one role or persona signs in: a **Route** and **Who may open it** on every
  screen, and a **LANDING** block of `- <Role> → <route>` lines in precedence order, ending
  `- Anyone else → /no-access`. Such a plan without LANDING is incomplete.

## MAPS (only when the app is geographic)

Include this section ONLY when the app plots something on a map — a locator, delivery or
fleet tracking, territories, parcels, routes, a "where are my X" screen. Omit it entirely
otherwise, and never add a map to an app that did not ask for one.

**Omitted means the heading is not in the file.** Do NOT write `## MAPS` followed by
"(Omitted — no geographic requirements)", "N/A", "not applicable", or any other
placeholder. A heading that announces its own absence is the section, present. On a
non-geographic app the reader goes straight from SCREENS to DATA MODEL & STATE.

When it is present it MUST pin five things, because the builder decides each of them ad hoc
at implementation time otherwise:

- **SCREENS WITH MAPS** — which screens carry one, and at what size (full-height / panel /
  thumbnail).
- **BASEMAP (required)** — the exact tile URL, plus one line of WHY it suits this app. This
  is a design decision of the same weight as the palette, and it is the one most often left
  unmade: an app whose plan does not name a basemap comes out on the default street map no
  matter what it is for. `invoke_skill` the `maps` skill for the provider table — it carries
  the keyless providers, their attribution, Esri's reversed `{z}/{y}/{x}` path, and which
  two cannot be granted a CSP origin.
- **GEOMETRY** — what is drawn: points, routes (polylines), areas (polygons/circles), or a
  mix — and **how many points each layer holds**: the exact count from the brief, or the count
  automation or record count the builder must read. Not a rounded guess; the `performance` skill
  picks the layer from it.
- **GEOCODING / ROUTING** — whether the app must turn an address into coordinates or compute
  a route. Write `none` when it does not. This is not a detail: those are network calls the
  app's OWNER has to allow through CSP, so the decision belongs in the plan rather than being
  discovered mid-build. Prefer storing lat/lng on the record over geocoding at render.
- **AREA TOOLS** — on a map, whether users draw an area and ask an AI agent
  about the points inside it. When they do, write the prebuilt `<MapAreaTools>` (the
  `map-actions` skill) and which AI agent answers; a drawn selection goes here, not under
  GEOMETRY. Write `none` when no agent answers — drawing without one is hand-rolled.

```
MAPS:
- Screens: Parcels (full-height), Compare (two side-by-side), Survey log (thumbnails)
- Basemap: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
  — the user judges terrain and land use by eye, so imagery beats a street map
- Geometry: parcel polygons + substation points; no clustering (12 parcels)
- Geocoding/routing: none — parcels carry lat/lng in seed data
- Area tools: none — parcels are picked one at a time
```

## DATA MODEL & STATE

**No I18N line, and no I18N section, anywhere in the plan.** Not `I18N: English only`, not
"no translation layer", not a heading, not a NOTES bullet — in EITHER direction, including
when the user chose English only (the default). The plan is silent about language: the
decision lives in `app/src/i18n/languages.json`, and the builder scopes translation after
approval with the `localization` skill. A line recording the decision here is the section
by another name, and the builder reads it as the translated contract.

- **PERSISTENCE (required, first line): `local` or `backend`** — from the user's
  persistence decision (the planner always asks; UI-only/local is the default when the
  user doesn't explicitly choose backend). `local` = data lives in the browser via
  localStorage (zustand). `backend` = explicit opt-in: data lives in shared backend
  objects (entities); the builder provisions them with the entity tools and the app
  does CRUD via the SDK hooks (see the `backend-integration` skill) — NOT localStorage.
  State this explicitly.
- **AUTH (required, second line): `login` or `public`** — whether the app has a
  sign-in. This is INDEPENDENT of PERSISTENCE (a `local` app can require login; a
  `backend` app can be public). Every app is **private by default** — choose `login`
  when the app has any notion of user accounts, per-user data, or roles; choose
  `public` only when the app has no sign-in concept at all (a demo, a personal single-
  user tool, a marketing/content surface). `login` = the builder builds the login page
  (template `/login` route + the `authentication` skill's identity-provider surfaces).
  `public` = the builder builds NO login page. Note: public-vs-private is ultimately the
  interface's `security.type` (set by the user in the platform's Privacy settings and
  resolved by the SDK) — the AUTH decision here only drives whether a login page is
  built. State it explicitly.
- **EXISTING OBJECTS (required whenever the user named any)** — list every entityType
  the user told you to build on, one per line, spelled EXACTLY as they gave it. These
  exist and hold the user's real records, so they are used AS THEY ARE: never re-created,
  never seeded. The builder fetches each stored schema with `read_object` and proves
  how the objects link to one another; that map drives the drill-downs, so do NOT restate
  their fields or assert a relationship as if you knew it, and spec no seed data for
  them. Anything a screen needs that their objects may not carry goes in NOTES as an open
  question. **If the user said not to create new objects, say so on this line** — then it
  is the complete model: no additional object, no localStorage store, no seed data
  anywhere. Omit this line entirely when the user named none.
- Entities with fields and types — **the objects to CREATE**, i.e. everything not covered
  by EXISTING OBJECTS above (leave this out entirely when the user said to create none).
  For `backend`, these become the objects the builder mints; for `local`, they're the
  localStorage shapes. Seed data requirements — realistic, plentiful (15+ rows), properly
  formatted dates/currency — apply to THESE only, never to a store of automation results,
  which starts empty. Seeded dates are specified RELATIVE to run time ("3 overdue, 5 due
  today"), never fixed calendar dates — a fixed spread stops matching "today" and every
  date-filtered view then renders empty.
- Dates, numbers, currency and units go through `useFormatters()` — locale hygiene, not
  translation, and required in an English-only app exactly the same. A closed set
  (statuses, kinds, priorities, nav items, tabs) declares its labels ONCE beside the set,
  never spelled out at a render site.

## COMPONENTS
- The shadcn/ui components to use, mapped to screens (e.g. Table, Dialog, Tabs, Card, Badge).

## DESIGN SYSTEM
The template ships a **grayscale** shadcn/ui theme (OKLCH tokens in `src/index.css`,
chroma 0). A plan that doesn't prescribe a real palette ships gray — so commit to a
distinctive, cohesive color system. This section has TWO deliverables: the design
spec (prose, below) and a machine-readable `theme.json` file.

### Design spec (prose)

Specify all of:

- **Color mode** — light or dark. Not a default: justify it in one line from a usage scene (who
  uses this, where, under what ambient light). Light suits most business/CRUD/content apps; dark
  suits monitoring, dev tools, media, immersive dashboards.
- **Color strategy** (choose one *before* picking colors): *restrained* (tinted neutrals + one
  accent ≤10% — the product default), *committed* (one saturated color carries 30–60% of the
  surface), or *full palette* (3–4 named roles used deliberately).
- **Palette** — the full shadcn token set in OKLCH (the canonical token list is in the
  `theme.json` spec below; `src/index.css` uses the same names with a `--` prefix). Give
  concrete values, never "primary blue". Derive the whole family from ONE brand hue —
  tinted neutrals carry 0.005–0.015 chroma toward that hue (don't default-tint warm or cool).
- **Semantic colors** — success / warning / error / info, mapped to the app's real status values
  (e.g. ticket Open=blue, In Progress=amber, Resolved=green, Blocked=red). Keep conventional
  green/amber/red unless the brand defines otherwise.
- **Contrast (WCAG AA, required)** — every text/background pair: body ≥4.5:1, large/bold ≥3:1. The
  #1 failure is muted-gray text on a tinted near-white — bump body text toward the ink end. For a
  label on a filled primary/success/error chip, pick a foreground that stays AA on that fill.
- **Font** — commit to ONE display + ONE body (or one family across weights); never "Inter or
  Roboto". Pair on a contrast axis (serif+sans, geometric+humanist), not two similar sans.
- **Layout** — sidebar vs topbar, content zones, density (airy vs dense), and the dark-mode
  strategy (swap tokens via the `.dark` class, not per-component overrides).
- **Corner radius** — a shape decision that carries identity like color and type do. Pick from
  the app's character; the range spans `"0"` (angular/editorial), `"0.25rem"` (crisp),
  `"0.625rem"` (soft), `"1rem"` (friendly) — these are anchors, not a fixed menu: choose any value
  on the scale that fits and commit to it. State the value AND a one-line reason tied to the app.
  Landing on `~0.625rem` without a reason is the template default, not a decision — choose on purpose.

Avoid the AI-default tells: **no** purple gradients, **no** cream/sand/beige near-white body bg
(OKLCH L 0.84–0.97, C<0.06, hue 40–100), no gradient text, no colored side-stripe borders on
cards.

### theme.json (REQUIRED)

Write a `theme.json` file at the workspace ROOT (sibling of `PLAN.md`) — the
machine-readable form of the palette you just specified. The platform materializes it
into the app's CSS tokens + font on every build, so a plan without it ships gray. Shape:

```json
{
  "mode": "light",
  "font": {
    "sans": "Plus Jakarta Sans",
    "heading": "Plus Jakarta Sans",
    "googleHref": "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
  },
  "light": { "...every token below..." },
  "dark":  { "...every token below..." }
}
```

- `mode` — `"light"` or `"dark"`, matching the Color mode you chose (the app still carries
  both token sets so the dark-mode toggle works; `mode` is just the default).
- `font.sans` is the body family; `font.heading` is optional (defaults to `sans`).
  `googleHref` is the Google Fonts **css2** URL that loads them — append a second
  `&family=…` when heading differs from sans. Choose fonts that exist on Google Fonts.
- `light` and `dark` are BOTH required. Each maps every template token — names WITHOUT the
  `--` prefix — to an OKLCH value: `background, foreground, card, card-foreground, popover,
  popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted,
  muted-foreground, accent, accent-foreground, destructive, border, input, ring, chart-1,
  chart-2, chart-3, chart-4, chart-5, sidebar, sidebar-foreground, sidebar-primary,
  sidebar-primary-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border,
  sidebar-ring` — plus `radius` (the corner-radius identity you committed above). Use the same values you committed to in
  the prose palette; derive the `dark` set by swapping surfaces/text while keeping the hue.

## NOTES
- Constraints, non-goals, anything ambiguous you resolved and how.

Rules:
- Preserve the user's domain vocabulary — never rename their entities.
- Plans describe WHAT, not code. No code in the plan.
- If the user mentioned a real brand, research its actual colors before picking a palette.
