---
name: localization
description: Turn translation on for an app, add a language, and make the layout survive it. Load BEFORE your first string on any app that needs i18n — the user named a UI language (in their brief, their answer to the planner, a follow-up, or anywhere in the conversation), `languages.json` lists more than one language, or the app already uses `useTranslation` — on any turn, a plan-approved first build included. Also load it when the user asks for a language switcher, "make it Arabic/Spanish/Japanese", asks about RTL or text direction, asks why dates/numbers/currency read wrong for their region, asks to translate records rather than UI copy, or before telling a user any of that cannot be done. An English-only app never loads it — its strings are plain text, and live in <strings>.
version: 24
---

# Adding a language

## FIRST: is this app translated at all?

Translation is opt-in. The planner asks the user outright, and the answer reaches you
through the conversation and the code. **Settle this before you do anything else in this
skill**, because the two states start from completely different places:

Four signals settle it, and ANY one of them means the app should be translated. The plan can
go stale; the code cannot, so check the code:

```sh
cat app/src/i18n/languages.json && cat app/src/i18n/en/*.json 2>/dev/null
```

| Signals | Where the app is | Where you start |
|---|---|---|
| **none** of: the user's request naming a language; a plan naming a language beyond English; >1 entry in `languages.json`; keys in `app/src/i18n/en/*.json` or a page importing `useTranslation` | every string is plain English; `app/src/i18n/` has no catalogue folder (no `en/`); `resources.d.ts` has no keys | **the retrofit below** — there is nothing to sync yet |
| **any** of the four | every string is already a `t()` call, or is about to become one | the retrofit if the code is still plain, otherwise the three-step add |

The user's request is the only signal a **no-plan build** has — a deliberately small app or a
follow-up edit never reaches the planner, so nobody was asked the question and there may be
no `PLAN.md`. "A small Spanish flashcard app" is an opt-in even with no plan behind it. Mind
the difference between a language as the UI and as the SUBJECT, though: an app *for learning*
Spanish is an English UI over Spanish content.

The third signal is the one that matters on an OLDER app. Every app built before translation
became opt-in wraps every string in `t()` while shipping exactly one language — so the plan
and `languages.json` both read "English only" on an app that is already fully wrapped. It
needs the three-step add, not the retrofit; running the retrofit over it would be a no-op at
best. Never strip `t()` back out to "match" a plan that says English only — the code wins.

## Scope it once, before any code

On a first build from an approved plan, or when converting a whole English-only app, work
these out against the plan's DATA MODEL and SCREENS (or the app's routes) before writing
code. Keep them in working memory — they are not a file, not a second plan, and never
presented; do not call `create_plan` or `present_plan`, and do not pause for them.

1. **Languages:** every requested language, the default, and direction (`ltr`/`rtl`).
2. **Where the app is:** a retrofit from English-only, or already translated (the table
   above — read the code, not the plan).
3. **Frontend closed sets:** tokens whose labels the frontend owns — statuses, kinds,
   priorities, nav items, filter/sort options, tabs, chart labels.
4. **Frontend-authored copy by screen:** headings, section titles, placeholders, labels,
   empty/loading/error states, buttons, toasts, export headers, print-view copy.
5. **Untranslated-by-design data:** seed/backend content and user-owned free-form strings.
6. **RTL surfaces:** when any language is RTL, the screens where layout, directional icons,
   physical side props, bidi text, charts or fonts need attention.

Say nothing about the scope in your final message — no keys, no catalogues.

`bun run i18n:sync` scaffolds only the keys extraction can SEE. Run it on an app that was
built English-only and it writes a catalogue for the handful of keys that happen to exist,
the new language reports itself complete, and nine tenths of the app stays English with a
switcher on top claiming otherwise. That is the single failure this ordering exists to
prevent.

## The retrofit: turning translation on

Only for an app that is currently English-only. Do this BEFORE adding any language. It is
mechanical, and the template's own files are the before-and-after for every case.

0. **Turning translation on adds the i18n scripts — always, first.** Add all six to
   `"scripts"` in `app/package.json`:

   ```jsonc
   "i18n":         "i18next-cli extract --sync-primary",
   "i18n:types":   "i18next-cli types",
   "i18n:lint":    "i18next-cli lint",
   "i18n:sync":    "i18next-cli sync",
   "i18n:status":  "i18next-cli status",
   "i18n:plurals": "node ../.agents/skills/localization/scripts/check-plurals.mjs"
   ```

   `i18next-cli` is already on your PATH — never `bun add` it, and never copy or write your
   own plural check. In the same step, add one row per script to the Scripts table in
   `app/README.md` (`| \`bun run i18n\` | what it does |`), so the README lists what the app has.
1. **Wrap the app's own screens.** Every frontend-authored string — JSX text, `placeholder`,
   `aria-label`, `title`, `alt`, `label`, every `toast()` — becomes
   `t('roleName', 'The English')` under `const { t } = useTranslation('<page>')`, one
   catalogue per page named after the page component. Keys are FLAT and name the ROLE
   (`emptyState`), never the text (`noOrdersYet`): the key then survives a copy change.
   Content data — names, descriptions, anything from a record or a seed row, anything a
   user typed — does NOT get wrapped.
2. **Wrap the template surfaces the app inherited.** These are easy to forget because nobody
   wrote them this turn, and they are the screens every user sees first:
   - `app/src/App.tsx` — the placeholder, if it is still there
   - `app/src/routes/Login.tsx` → `useTranslation('login')` + `common`
   - `app/src/routes/ForgotPassword.tsx` → `useTranslation('forgotPassword')` + `common`
   - `app/src/routes/UpdatePassword.tsx` → `useTranslation('updatePassword')`
   - `app/src/components/copilot.tsx` → `useTranslation('copilot')`
3. **Convert the module-scope label maps.** `app/src/data/seed.ts` ships
   `STATUSES: Record<Item['status'], string>` with plain English, and carries a comment
   naming exactly what it becomes: `Record<Item['status'], TKey>` with
   `vocab('status.available', 'Available')`, rendered `t(STATUSES[item.status])`. Every
   closed set in the app gets the same treatment — statuses, kinds, priorities, nav items,
   filter and sort options, tabs, column definitions.
4. **Convert the strings produced outside React.** `app/src/lib/passwordPolicy.ts` is the
   worked case: English-only each rule carries a `label: string` built with a `plural()`
   helper; translated it carries `labelKey: PolicyKey` + `labelVars`, `lifecycleNotes`
   returns `PolicyNote[]` rather than `string[]`, and `UpdatePassword.tsx` renders
   `t(rule.labelKey, rule.labelVars)` / `t(note.key, note.vars)`. `PolicyKey` is
   `BaseKey<keyof Resources['updatePassword']>` — the plural suffix stripped, because the
   CALL passes the base name and i18next picks the form. A sentence resolved at module scope
   is resolved once, at import, in whichever language loaded first, and the screen can never
   re-read it.
5. **Restore the sentences that carry markup to `<Trans>`.** The `MissingAgentId` block in
   `copilot.tsx` is the shipped example and says so in a comment. Never split one sentence
   across several `t()` calls to fit markup around it.
6. **Extract and type.** `cd app && bun run i18n`, then `bun run i18n:types`. The catalogues
   and `resources.d.ts` now exist for the first time; a bare `t('typo')` is a build error
   from here on.
7. **Check your own work before adding a language:** `bun run i18n:lint` must be clean, and
   read the routes for strings it cannot see — it reads `t()` CALL SITES, so a label in a
   non-React module or a key built at runtime is invisible to it.

Only now go on to the add below.

## The three-step add

1. **Declare the language in BOTH places.** They are read by different things.

   `app/src/i18n/languages.json` — the RUNTIME reads this, for the switcher label and the
   text direction:
   ```json
   {
     "default": "en",
     "languages": {
       "en": { "label": "English", "dir": "ltr" },
       "ar": { "label": "العربية", "dir": "rtl" }
     }
   }
   ```
   `label` is written IN that language, never in English — "Español", not "Spanish". `dir` is
   `rtl` for Arabic, Hebrew, Persian and Urdu; `ltr` otherwise.

   `app/i18next.config.mjs` — the TOOLING reads this:
   ```js
   locales: ['en', 'ar'],
   ```
   Miss this one and `sync` silently does nothing.

2. **Scaffold, then translate.** From `./app`:
   ```
   bun run i18n:sync      # every key, in every catalogue, with an empty value
   bun run i18n:status    # what is still untranslated
   ```
   `i18next-cli` is on your terminal's PATH, installed in the sandbox image beside bun — not
   in the app's `node_modules`. Call it directly if you need the binary; never via `npx`,
   which cannot see a tool it did not install and goes to the network instead, where the
   sandbox kills it at its time limit.
   `sync` writes `""` for each key it adds. Fill those in. Never hand-write the key list —
   `sync` is what guarantees it matches the default language exactly.

3. **Add a switcher**, if the app now ships more than one language:
   ```tsx
   import { IS_MULTILINGUAL, LANGUAGES, setLanguage, useLanguage, useTranslation } from '@/lib/i18n'

   function LanguagePicker() {
     const lang = useLanguage()
     const { t } = useTranslation('common')
     if (!IS_MULTILINGUAL) return null
     return (
       <Select value={lang} onValueChange={setLanguage}>
         <SelectTrigger aria-label={t('language', 'Language')} data-test-id="language-select">
           <SelectValue />
         </SelectTrigger>
         <SelectContent>
           {Object.entries(LANGUAGES).map(([code, meta]) => (
             <SelectItem key={code} value={code} data-test-id={`language-option-${code}`}>
               {meta.label}
             </SelectItem>
           ))}
         </SelectContent>
       </Select>
     )
   }
   ```

No other component changes. That is the whole point of having extracted as you went.

## Translate properly, and say what you are unsure of

You write the translations. There is no translation service wired in, and nobody downstream
checks them.

- Translate the MEANING, not the words — and translate it IN CONTEXT. A button that says
  "Submit" in English is often a verb specific to the action in other languages; a heading
  is not phrased like a toast; "book" in a travel app is the reservation verb, never the
  paper object. Pick the domain's register once and keep terminology consistent across
  every catalogue — the same concept must not surface as three different words on three
  screens.
- Keep `{{variables}}` exactly as they are, but move them where the sentence needs them —
  that freedom is the reason one key holds a whole sentence.
- Plurals are not optional. `count_one` / `count_other` covers English; Arabic needs
  `count_zero`, `count_one`, `count_two`, `count_few`, `count_many`, `count_other`, Polish
  needs `one`/`few`/`many`, Japanese needs only `other`. `Intl.PluralRules` picks; you supply.
  A form you omit falls back to `_other`, which reads wrong rather than crashing. You do not
  have to create them: `allPluralForms` in `i18next.config.mjs` scaffolds every form any
  configured locale needs, and `status` counts each locale against the forms that locale
  actually uses — so an Arabic `_few` arrives as an ordinary empty key and translating what
  `status` reports is enough. **`bun run i18n:plurals` is the exception handler**: a plural
  key named only indirectly (`t(rule.labelKey)`) is never regenerated by extraction, so
  nothing expands its forms and `status` cannot see the gap. Run it before calling a
  language done.
- **AUTHOR every translation yourself; never derive values mechanically.** There is no
  machine-translation route here: the sandbox has no network and no MT package —
  `translatepy`, `deep-translator`, `googletrans` all fail at import, and one observed build
  then fell back to a PREFIX LOOP (`f'हिन्दी अनुवाद: {english}'` over every catalogue),
  followed by a broken "repair" that split on the prefix and left the literal word "हिन्दी"
  as every value. Bulk `python3` writes are fine as a TYPING device for translations you
  composed; a loop that MANUFACTURES values from the English (prefixing, transliteration,
  MT) is a fake factory, and every shape it produces fails the gate. If you cannot compose
  a value, leave it `""` and say so.
- **An empty value is safe; a copied one is not.** A key left `""` falls back to the default
  language, so a half-translated app stays readable. Pasting the English into the new
  language's file is NOT the same thing — it marks the string as done, `status` counts it,
  and nobody ever revisits it. Translate it or leave it empty; never fake it.
- For legal, medical, financial or safety copy, translate it and then **say in your final
  message that a speaker should review those specific strings before it ships.** Name them.
- **The finish line is EVERY frontend string reading natively** — headings, titles,
  placeholders, aria-labels, tooltips, toasts, empty states, validation messages. Not most of
  them: all of them. `bun run i18n:plurals` is the gate, and it now fails on every known way
  of faking it — a value copied from English, a value with no target-script text, a
  "<language> translation: …" STUB with the English embedded inside it, a HALF-TRANSLATION
  ("A clear view of your money this महीना" — one word swapped, the sentence still English), a
  `{{variable}}` that does not match the source, and a language declared but never
  scaffolded, a CONSTANT FILL (many different source strings all "translated" to one
  identical word — a catalogue full of the language's own name is the observed case),
  and any ENCODING ARTIFACT — mojibake, a literal \uXXXX escape, an HTML entity
  like &amp;, the U+FFFD replacement character. Catalogue values are plain UTF-8 rendered
  verbatim: write the real characters. A value is ONE language end to end — brand names and code identifiers
  excepted; never splice target-script words into an English sentence or glue English
  plurals onto target-script nouns. There is no wording of a fake that passes; translate
  the whole value or leave it `""` and say so.

## RTL is the actual work

An Arabic app with LTR layout is broken in a way users cannot articulate. Budget real time.

`I18nProvider` already writes `dir` on `<html>` — you do not wire that up. What it does NOT
do is fix a layout built out of physical utilities. Tailwind's `ltr:`/`rtl:` variants compile
to `:where([dir="…"])`, so they read the document and follow automatically; `pl-4` does not.

| stop | start |
|---|---|
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `left-*` / `right-*` | `start-*` / `end-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `border-l` / `border-r` | `border-s` / `border-e` |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |

`flex-row` already reverses under `dir="rtl"`. Do **not** add `flex-row-reverse` on top — that
flips it back.

**The component layer is already handled — do not re-plumb it.** Tailwind reads the document,
but Radix primitives (Tabs, Select, DropdownMenu, Popover, Sheet, and everything built on them)
do NOT: they read Radix's own `DirectionProvider` and default to `ltr` without one. `I18nProvider`
supplies it, bound to the active language, so tab order, dropdown alignment, popover side and
keyboard arrow direction all mirror with the rest of the layout. You do not wire this up, and you
must **never `bun add @radix-ui/react-direction`** — the `radix-ui` package the app already depends
on re-exports it as `Direction`, and a second copy is a duplicate dependency, not a fix.

**Physical props that no provider can flip.** A handful of component APIs take a side as a VALUE
rather than a style, so neither the document nor the provider reaches them. `useDirection()` from
`@/lib/i18n` is for exactly these:

| component | prop | in RTL |
|---|---|---|
| `Sheet` / `Drawer` | `side="left"` | must become `"right"` — a mobile nav drawer opens from the start edge |
| `DropdownMenu` / `Popover` | `align="start"` | already direction-aware via the provider — leave it |
| Recharts axes | `orientation` | does not mirror; see below |

```tsx
const dir = useDirection()
<SheetContent side={dir === 'rtl' ? 'right' : 'left'}>
```

**Icons.** Mirror the ones that mean reading direction: back/forward, next/prev, a chevron
that advances. Leave everything else: clocks, checkmarks, logos, media play, and any icon
naming a physical edge or corner (a "border-left" control still points at the same side of
the box in Arabic). Wrap those in `dir="ltr"` on the element itself.

**Bidi.** Numbers, IDs, emails, code and user-generated text inside RTL prose get reordered by
the bidi algorithm. Put `dir="auto"` on inputs and on anything rendering text you did not
author; wrap order numbers, emails and code in `<span dir="ltr">`.

**Charts do not mirror.** Recharts has no RTL mode — axes, legends and tooltips stay LTR. Do
not fake it with a transform; that mirrors the digits too. Leave the chart LTR inside an
otherwise RTL page and say so in your final message.

## Fonts: you cannot add one, and you must say so

The Google Fonts `<link>` lives inside the engine-owned `ua:theme-font` block in
`app/index.html`, and the font tokens come from the platform brand theme. **Both are re-baked
on every build**, so a webfont you add by hand is gone by the next preview.

Arabic, Hebrew, CJK, Devanagari and Thai will therefore render in the device's system
fallback rather than the brand face. On modern devices that looks fine; it will not look
identical to the Latin screens. **Tell the user before they find out.** If they want brand
typography in that script, that is a design-system change — load the `theming` skill and
route them to it. Never hand-edit the theme CSS, the token block, or the font link.

## Formatting

`useFormatters()` from `@/lib/i18n` is already bound to the active language:

```tsx
const fmt = useFormatters()
fmt.date(order.createdAt)                  // { dateStyle: 'medium' } by default
fmt.number(1234.5)
fmt.currency(order.total, order.currency)  // the CODE comes from the record
fmt.relative(-3, 'day')
fmt.unit(0.6, 'kilometer')                 // "0.6 km" / "٠٫٦ كم" — number AND unit localized
rows.sort((a, b) => fmt.compare(a.name, b.name))
```

Currency is a business fact, not a language one — a French user may still be billed in USD.
Never derive the currency code from the language. `date-fns` is installed and ships locales if
a file already uses it; never add a second date library.

**A measurement is a NUMBER plus a unit, never a string.** `details: '0.4 mi from the cathedral'`
puts a measurement inside copy, and translation then renders the unit's WORD (`0.4 ميل`) while
the value stays wrong for every metric reader — a translated unit over an unconverted number is
worse than English, because it looks localized. Store the metric number in the data
(`distanceKm: 0.6`), keep it out of the translation key, and format at the screen with
`fmt.unit(distanceKm, 'kilometer')`. The identifiers are Intl's sanctioned set ('kilometer',
'liter', 'celsius', compound forms like 'liter-per-kilometer'); a typo throws at the call site
rather than silently rendering English.

## Values stored as data: translate the vocabulary, not the record

The commonest reason a screen stays English in every language is not a missed string — it is a
value rendered straight from data. A status pill, a type column, a severity chip, a filter's
options, a fixed notification title. `i18next-cli` reads CALL SITES, so it never saw one, and
`i18n:lint` and `i18n:status` both report clean while the screen is half-English. **A green
status is not evidence of a localized app.**

Split them by one question: **can you enumerate the values?**

- **A CLOSED SET — yes.** Statuses, employment types, severities, categories, a fixed set of
  notification titles. This is UI vocabulary that happens to be stored as data, and it must be
  translated like any other string.
- **FREE-FORM — no.** A person's name, a department, a record title someone typed. There is no
  correct translation of it and inventing one corrupts the record. Leave it, and **say in your
  final message that you left it and why** — otherwise it gets reported as a missed translation.
  If they want those translated too, that is a per-record translations layer and a data-layer
  change: load `object-data` and scope it, don't improvise it.

**The question is who owns the SET of allowed values, not where a value came from.** A `status`
read off a record is a CLOSED SET — the row supplied the token, your app defined which tokens
exist — so it is translated like any other vocabulary. "It comes from data" decides nothing.

- **CONTENT DATA — no, seeded or fetched alike.** Rows delivered by the data layer — a
  product's name, description, tagline, spec lines — are DATA, and seeding does not change
  that: a seed row stands in for what a backend would return, and it gets the backend's
  treatment. Translating it teaches the app a pattern that breaks the moment real records
  arrive, because an API returns strings, not translation keys. The test is WHERE the string
  arrives from at render time, never what it says: a navbar label is authored in the
  frontend, so it is translated; a table cell's value flowed in through `useData`, so it is
  rendered as-is. What IS translated around content is everything the frontend authors —
  column headers, empty states, buttons, badges, and the LABEL a screen shows for a
  closed-set token (the token `'shipped'` is data; "تم الشحن" is UI). In a multilingual app,
  **say in your final message that content data ships untranslated by design** — otherwise it
  is reported as a missed translation. And never bake a measurement into content as a string:
  store the metric number, format with `fmt.unit()` at the screen.

For a closed set, name every key with `vocab()` — the constant cannot call `t()` itself, because
a `t()` at module scope resolves once at import and freezes whichever language loaded first into
a value the screen can never re-read.

```ts
import { defineKeys, useTranslation, vocab } from '@/lib/i18n'

export const STATUSES = defineKeys([
  { value: 'active',   labelKey: vocab('status.active', 'Active') },
  { value: 'on_leave', labelKey: vocab('status.on_leave', 'On leave') },
])

// at the screen, where `t` follows the active language
const { t } = useTranslation('common')
STATUSES.map((s) => ({ ...s, label: t(s.labelKey) }))
```

**Determine the frontend closed sets ONCE, while modeling — then declare them.** List every
closed set the app renders (statuses, kinds, nav items, filter/sort options, tabs) and ask the
render-time question per set: is the LABEL the screen shows authored by the frontend? Yes → one
typed lookup beside the set, `t(LOOKUP[token])` at every render site. No — the label text is a
record a user owns, like an editable category name → data, rendered as-is. **Never build the key
at the call site.** `t(`nav.${item.key}`)` is invisible to extraction, so the keys it happens to
hit are deleted by the next `bun run i18n`; three consecutive builds shipped that landmine
(nav.*, status.*, service.*), each green on the day it shipped. `i18n:plurals` fails on any
template-literal key not covered by `preservePatterns` — resolving today or not — and the fix is
the lookup, never a new pattern entry.

**`TKey` in a data file marks the ONE thing there that is still frontend copy: a token's UI
label.** Content fields stay `string`. The pattern is a lookup from the closed set's tokens to
their labels, typed so a typo or a raw English label is a build error:

```ts
import { type TKey, vocab } from '@/lib/i18n'

interface Order {
  id: string                                   // identifier
  customerName: string                         // free-form record content
  totalMinor: number                           // formatted by useFormatters()
  status: 'confirmed' | 'shipped' | 'delivered' // a token: data
}

export const STATUS_LABELS: Record<Order['status'], TKey> = {
  confirmed: vocab('status.confirmed', 'Confirmed'),
  shipped:   vocab('status.shipped', 'Shipped'),
  delivered: vocab('status.delivered', 'Delivered'),
}

// at the screen: the row's VALUES render as-is, the token's LABEL follows the language
<td>{order.customerName}</td>
<td>{t(STATUS_LABELS[order.status])}</td>
```

`Record<Order['status'], TKey>` buys both ends: a status added to the union without a label is a
build error, and a label written as a bare English string is TS2322 at the line you wrote it.
`vocab()` makes each label a call site extraction can see, so the keys live and translate like
any other UI string — no `preservePatterns` entry.

`string` is the right type for an id, a url, a class name, an airport code — anything that is not
copy. The distinction is exactly the one above: would a reader of another language need this to
change?

**`app/src/data/seed.ts` is this boundary already written — read it before you write your own.**
It ships as a worked example: content fields `string` and rendered as-is, numbers formatted at
the edge, and a `STATUS_LABELS`-style lookup as the one place `TKey` belongs in a data file. It
also carries the loop a NEW labelKey needs: write `vocab('your.key', 'English')`, `bun run i18n`
to extract it, `bun run i18n:types` to regenerate — until you extract, the key does not exist
and `TKey` rejects it. Replace its model with the app's own; keep the shape, and do not leave it
beside your real one, or the example's rows ship in the app.

`vocab` returns the key and nothing else. What it buys sits at the two ends of the build: the key
becomes a TYPE, so a typo or a key lost to a rename is a build error rather than `status.activ`
rendered at a user; and it becomes a call site `i18next-cli` can see, so the key is extracted and
kept like any other — **no `preservePatterns` entry, and its plural forms scaffold normally.**
The second argument is the English, written where the vocabulary is defined, so `bun run i18n`
puts it in the catalogue and `--sync-primary` keeps it in step when you reword it.

Vocabulary goes in `common` — a set of labels rendered from data is used across pages by
definition. `defineKeys` only stops the literal types widening to `string`; `as const` does the
same job.

## Record content is not UI copy

Data read through the SDK hooks comes back exactly as stored, in one language. The platform's
storage bindings always send `translationsOption: "DEFAULT"` and nothing here can change that,
so **there is no server-side translation of records.**

If the user wants content in several languages it has to be modelled — either a field per
language (`name_en`, `name_ar`) or a `locale` column with one row per language, filtered on
the active language. That is a data-layer change: load the `object-data` skill and do it
there. Say which of the two you are proposing before you build it.

## Copilot

`src/components/copilot.tsx` takes a `dir` prop that is deliberately left unset so the
document's direction wins — leave it that way. Its own chrome is already in
`i18n/<lang>/copilot.json`, so it translates with everything else.

But the **agent's replies** come from the platform AI agent, in whatever language that agent
is configured for. The app cannot translate them. If the user wants Arabic answers, that is a
change to the agent's instructions on the platform, not to this app.

## An app with no i18n runtime

An app built before this convention has no `app/src/i18n`, no `app/src/lib/i18n` and no
`app/i18next.config.mjs`. This is NOT the same as an English-only app built from the current
template, which has the runtime and the config (just no catalogues yet) and simply
does not use them — there, the retrofit above is the whole job and none of this section
applies. Here the runtime itself is missing: bring it up to date, then convert the app per
the retrofit above.

1. `cd app && bun add i18next react-i18next` — the CLI needs no install; it is already on
   your PATH, in the image your terminal runs in.
2. Write the runtime from the listing below. **There is no other app to copy from** — your
   terminal is jailed to THIS app's tree and nothing outside it is readable, so a "copy it
   from a current app" instruction cannot be followed. Everything you need is in this file.
   Do NOT write your own resolver, and do NOT reach for a language-detector plugin;
   `language.ts` below already does that job.
3. Mount `I18nProvider` in **`App.tsx`** around `BrowserRouter` — never in `main.tsx`, which
   is engine-owned:

   ```tsx
   <I18nProvider>
     <BrowserRouter basename={basename}>{/* routes */}</BrowserRouter>
   </I18nProvider>
   ```
4. Set `<html lang>` / `<html dir>` in `index.html` to the default language, so the first
   paint matches what the provider is about to write.
5. Convert that one page's strings, then `bun run i18n` and `bun run i18n:types`.

6. The files, in full. This is the whole runtime — two source files, a manifest and the
   tooling config. Copy them verbatim.

   **`app/src/i18n/languages.json`** — the languages this app ships:

   ```json
   {
     "default": "en",
     "languages": {
       "en": { "label": "English", "dir": "ltr" }
     }
   }
   ```

   **`app/src/lib/i18n/language.ts`** — which language to start in, and where that is
   remembered. Pure, so it is also the thing a language-detector plugin would duplicate:

   ```ts
   // Which language to start in, and where that choice is remembered. Pure — no i18next and no
   // React — so the negotiation rules stay readable and reusable without booting either.
   
   const STORAGE_KEY = 'app.lang'
   
   /** The best match for a browser's language list among the languages this app ships.
    *  Exact tag first (`pt-BR`), then the base (`pt`), then the default. */
   export function negotiate(
     preferred: readonly string[],
     available: readonly string[],
     defaultLang: string,
   ): string {
     for (const tag of preferred) {
       if (available.includes(tag)) return tag
       const base = tag.split('-')[0]
       if (available.includes(base)) return base
     }
     return defaultLang
   }
   
   // localStorage throws in a sandboxed frame and in some private modes. The language is a
   // preference, not state the app needs — failing to read or write it must never be fatal.
   export function readStoredLang(available: readonly string[]): string | null {
     try {
       const stored = window.localStorage.getItem(STORAGE_KEY)
       return stored && available.includes(stored) ? stored : null
     } catch {
       return null
     }
   }
   
   export function storeLang(lang: string): void {
     try {
       window.localStorage.setItem(STORAGE_KEY, lang)
     } catch {
       /* ignored — see readStoredLang */
     }
   }
   
   export function detectLanguage(available: readonly string[], defaultLang: string): string {
     const stored = readStoredLang(available)
     if (stored) return stored
     const preferred =
       typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
     return negotiate(preferred, available, defaultLang)
   }
   ```

   **`app/src/lib/i18n/index.tsx`** — the runtime:

   ```tsx
   import * as React from 'react'
   import i18next from 'i18next'
   import { I18nextProvider, initReactI18next, useTranslation } from 'react-i18next'
   import manifest from '@/i18n/languages.json'
   import { detectLanguage, storeLang } from './language'
   
   export { Trans, useTranslation } from 'react-i18next'
   
   /**
    * The app's strings.
    *
    * EVERY user-facing string lives in `src/i18n/<lang>/<page>.json` and reaches the screen
    * through `useTranslation`, with the English written at the CALL SITE as the second argument:
    *
    *   const { t } = useTranslation('orders')      // -> src/i18n/<lang>/orders.json
    *   <h1>{t('title', 'Orders')}</h1>
    *   <p>{t('count', { count: n, defaultValue_one: '{{count}} order',
    *                              defaultValue_other: '{{count}} orders' })}</p>
    *
    * `i18next-cli extract` harvests those defaults into the catalogues (`bun run i18n`), so
    * nobody edits JSON by hand. It also means a screen whose catalogue has not been generated
    * yet still renders correctly in English — a missed extraction costs a translation, never a
    * page showing `orders.title` at a user.
    */
   
   export type Direction = 'ltr' | 'rtl'
   export interface LanguageMeta {
     label: string
     dir: Direction
   }
   
   // Every catalogue in the tree, resolved at BUILD time and handed to i18next as `resources`.
   // This is what keeps the whole async half of i18next out of the app: no backend plugin, no
   // Suspense, no loading state, no flash of untranslated text — the strings are in the bundle.
   const MODULES = import.meta.glob<Record<string, string>>('../../i18n/*/*.json', {
     eager: true,
     import: 'default',
   })
   
   const resources: Record<string, Record<string, Record<string, string>>> = {}
   for (const [path, catalog] of Object.entries(MODULES)) {
     const match = /\/i18n\/([^/]+)\/([^/]+)\.json$/.exec(path)
     if (!match) continue
     const [, lang, ns] = match
     resources[lang] ??= {}
     resources[lang][ns] = catalog
   }
   
   export const LANGUAGES = manifest.languages as Record<string, LanguageMeta>
   export const DEFAULT_LANG: string = manifest.default
   export const LANGUAGE_CODES: string[] = Object.keys(LANGUAGES)
   /** True once this app ships more than one language — gate a switcher on it rather than on a
    *  hardcoded list, so adding a language lights the switcher up. */
   export const IS_MULTILINGUAL = LANGUAGE_CODES.length > 1
   
   void i18next.use(initReactI18next).init({
     resources,
     lng: detectLanguage(LANGUAGE_CODES, DEFAULT_LANG),
     fallbackLng: DEFAULT_LANG,
     supportedLngs: LANGUAGE_CODES,
     defaultNS: 'common',
   
     // Keys are FLAT and live in a per-page file, so neither separator applies: left on, a key
     // like `user.name` would be read as a path into a nested object that does not exist.
     keySeparator: false,
     nsSeparator: false,
   
     // `i18next-cli sync` scaffolds a new language by writing every key with a value of "".
     // Without this, those empty strings count as translations and render as blank screens —
     // the one outcome worse than showing the default language.
     returnEmptyString: false,
   
     // React escapes for us; letting i18next escape too double-encodes every apostrophe.
     interpolation: { escapeValue: false },
     // Resources are already in memory, so there is nothing to suspend on.
     react: { useSuspense: false },
   })
   
   /** Change the app's language and remember it. */
   export async function setLanguage(lang: string): Promise<void> {
     if (!(lang in LANGUAGES)) return
     await i18next.changeLanguage(lang)
     storeLang(lang)
   }
   
   /** The active language code, re-rendering the caller when it changes. */
   export function useLanguage(): string {
     const { i18n } = useTranslation()
     return i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LANG
   }
   
   /**
    * The active language's writing direction.
    *
    * For the rare prop that CANNOT be logical. Tailwind's `ps-`/`pe-`/`start-`/`end-` follow
    * `<html dir>` on their own and are always the better answer; this is for the handful of
    * component APIs that take a physical side — a Sheet's `side`, a chart's axis orientation —
    * where there is nothing to flip and the value itself has to change.
    */
   export function useDirection(): Direction {
     const lang = useLanguage()
     return LANGUAGES[lang]?.dir ?? 'ltr'
   }
   
   /**
    * Mounts i18next and keeps `<html lang>` / `<html dir>` in step with it.
    *
    * That `dir` write is the load-bearing line for RTL: the design system's `ltr:` / `rtl:`
    * Tailwind variants compile to `:where([dir="…"])`, so they read the DOCUMENT rather than any
    * prop — every direction-aware rule in the app, and the SDK copilot's own layout, hangs off
    * it. Written for LTR too, so index.html's static attributes can never disagree with runtime.
    */
   export function I18nProvider({ children }: { children: React.ReactNode }) {
     const lang = useLanguage()
   
     React.useEffect(() => {
       const root = document.documentElement
       root.lang = lang
       root.dir = LANGUAGES[lang]?.dir ?? 'ltr'
     }, [lang])
   
     return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>
   }
   
   /**
    * Dates, numbers and sorting in the active language.
    *
    * Never format by hand and never pass a hardcoded 'en-US'. Currency is the exception that
    * proves it: the CODE is a business fact (a French user may still be billed in USD), so it
    * comes from the record — only the formatting is the language's business.
    */
   export function useFormatters() {
     const lang = useLanguage()
     return React.useMemo(
       () => ({
         date: (value: Date | number, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
           new Intl.DateTimeFormat(lang, options).format(value),
         number: (value: number, options?: Intl.NumberFormatOptions) =>
           new Intl.NumberFormat(lang, options).format(value),
         currency: (value: number, currency: string) =>
           new Intl.NumberFormat(lang, { style: 'currency', currency }).format(value),
         relative: (value: number, unit: Intl.RelativeTimeFormatUnit) =>
           new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(value, unit),
         compare: (a: string, b: string) => new Intl.Collator(lang).compare(a, b),
       }),
       [lang],
     )
   }
   
   export default i18next
   ```

   **`app/src/i18n/i18next.d.ts`** — wires the generated key types in:

   ```ts
   import type Resources from './resources'
   
   // Makes `t()` know this app's namespaces and keys, so a typo is a BUILD error instead of the
   // key appearing on screen. `resources.d.ts` beside this file is generated from the default
   // language's catalogues by `bun run i18n:types` — regenerate it after adding strings.
   //
   // The separators must match the runtime options in @/lib/i18n exactly: declared differently,
   // the types describe a nesting the runtime does not do, and every key looks wrong.
   declare module 'i18next' {
     interface CustomTypeOptions {
       defaultNS: 'common'
       resources: Resources
       keySeparator: false
       nsSeparator: false
     }
   }
   ```

   **`app/i18next.config.mjs`** — what the tooling reads:

   ```js
   /**
    * How `src/i18n/**` gets written. Run by the builder, never by hand:
    *
    *   bun run i18n          read the English at every t() call site -> the catalogues below.
    *                         It runs `extract --sync-primary`, and the flag is load-bearing:
    *                         plain extract never OVERWRITES an existing value, so rewording a
    *                         string in code left the old English in the catalogue, the catalogue
    *                         won at runtime, and the change silently never appeared on screen.
    *   i18next-cli lint      find user-facing strings that never reached a t() call
    *   i18next-cli sync      scaffold every key into a newly added language
    *   i18next-cli status    how much of each language is actually translated
    *
    * Plain ESM with no type import on purpose: the config must load without pulling the CLI's
    * types into the app's typecheck.
    */
   export default {
     // Every language this app ships. Keep in step with src/i18n/languages.json — that file is
     // what the RUNTIME reads (labels and text direction); this list is what the tooling reads.
     locales: ['en'],
   
     extract: {
       input: ['src/**/*.{ts,tsx}'],
       // The runtime's own tests build a throwaway i18next instance with inline resources, so
       // their `t('title')`-style calls would mint keys for strings no screen ever shows. The
       // ui primitives are vendored shadcn and own no product copy.
       ignore: ['src/**/*.test.{ts,tsx}', 'src/lib/i18n/**', 'src/components/ui/**'],
       output: 'src/i18n/{{language}}/{{namespace}}.json',
   
       functions: ['t'],
       // `useTranslation('orders')` binds the `orders` catalogue to whatever the `t` it returns
       // is renamed to, so `const { t: common } = useTranslation('common')` is followed too.
       // This is react-i18next's own hook, so no custom-hook shim is needed.
       transComponents: ['Trans'],
   
       // Keys are flat and live in a per-page file, so neither separator applies: without this,
       // a key like `user.name` would silently become a nested object the runtime cannot read.
       defaultNS: 'common',
       keySeparator: false,
       nsSeparator: false,
   
       // Scaffold every plural form any configured locale needs, in every locale. Arabic takes
       // six (zero/one/two/few/many/other) and Polish four where English has two, and NOTHING
       // else in the toolchain can produce them: extraction reads code written in one language,
       // and `sync` copies the shape of the source. Without this they are simply absent, and
       // `status` cannot report what it cannot see — it compares against the default language.
       // With it, the forms exist as "" and `status` counts each locale against the forms THAT
       // locale actually uses, so a missing Polish `_few` becomes an ordinary untranslated key.
       // The spare forms a language never selects (Polish `_two`) are inert and uncounted.
       allPluralForms: true,
   
       // A `t('…')` written inside a COMMENT is otherwise harvested as a real key — a stray
       // "…" entry appeared in copilot.json from an explanatory comment doing exactly that.
       extractFromComments: false,
   
       // `removeUnusedKeys` defaults to TRUE, and these keys are never written as literals:
       // @/lib/passwordPolicy names them (labelKey / PolicyNote.key) and UpdatePassword renders
       // them via t(rule.labelKey, rule.labelVars). Without this they are deleted on first run.
       preservePatterns: ['rule*', 'note*'],
     },
   
     // Compile-time key safety: generates the i18next module augmentation that makes `t()` know
     // this app's namespaces and keys, so a typo is a BUILD error rather than the key rendering
     // on screen. Regenerated by `bun run i18n:types`; the output is committed so a fresh clone
     // typechecks without running the tool.
     types: {
       input: ['src/i18n/en/*.json'],
       output: 'src/i18n/resources.d.ts',
     },
   }
   ```

## Before you finish: run the checks

On a translated app these are mandatory, in this order, from `./app`. Run each one as its
OWN command — never chain them with `&&`. Each exits non-zero when it finds something, so a
chain stops at the first finding and every check after it silently never runs; one audited
turn chained `i18n:lint && i18n:plurals`, lint failed on old strings, and the plural check
was never run at all.

```sh
bun run i18n           # re-read the English at every t() call site into the catalogues
bun run i18n:types     # only when you added, removed or renamed a key
bun run i18n:lint
bun run i18n:status
bun run i18n:plurals
```

`bun run i18n` goes first: the others read what it writes, so running them on a stale
catalogue reports yesterday's app. Fix what they report, then build again. After 2 fix
rounds, stop looping and list the survivors in your final message rather than grinding.

**`bun run i18n` can empty a string that was already translated.** When a call site passes
`count`, extraction replaces the plain key with its plural forms (`clearCompleted` →
`clearCompleted_one`, `clearCompleted_other`, …) and drops the old key from EVERY language —
so a translation that shipped yesterday becomes a row of empty strings today, and the button
falls back to English. `i18n:status` reports it as untranslated. After every `bun run i18n`,
fill each new plural form in every language — the dropped key's old value, from
`git diff app/src/i18n`, is the translation to start from.

**Report what did not pass.** Every check that still fails — `i18n:status` below 100%, a
`lint` finding, a `plurals` error — goes in your final message by name, with its count,
whether it predates this turn or not. While any of them fails, the app is not "fully
translated", and your message must not say so.

None of this runs on an English-only app. `i18n:lint` there reports every string on every
screen, and "fixing" what it names is how an app nobody asked to translate ends up wrapped
in `t()`.

## What the checks do NOT cover

Report a green check with its reach attached, never as a verdict on the app. Each of these
answers a narrower question than its name suggests:

| check | answers | blind to |
|---|---|---|
| `i18n:lint` | strings that never reached a `t()` call site | a value rendered from data, a label in a non-React module, a runtime-built key, a string in an export |
| `i18n:status` | how much of each CATALOGUE is filled | anything that never became a key — it reaches 100% on a half-English screen |
| `bun run build` | a raw literal in a field typed `TKey` — TS2322, at the line you wrote it | any display field still typed `string` |
| `i18n:plurals` | plural forms for keys extraction cannot see | everything else |
| — | — | **RTL layout. Nothing checks it. Switch the language and look.** |

"i18n lint is clean" is true and misleading in the same breath: an app reported exactly that
while ~90 English strings sat in a label module, three CSV exports and a handful of raw data
fields. Say what was checked, and say what was not. Content data is not a gap — it renders
as-is BY DESIGN, and the honest report names that choice.

    Bad:  "i18n lint is clean — every user-facing string goes through t()."
    Good: "i18n lint is clean, which covers t() call sites only; I read the routes for
          frontend strings that never became keys. Seeded content renders untranslated by
          design, as data. Neither checks RTL layout, so I switched to Arabic and looked
          at the three densest screens."

## Be honest about these

- **The platform does not tell the app who speaks what.** There is no SSO or profile locale.
  Language is the user's choice in the app, remembered in `localStorage`.
- **Code Builder's own UI is English.** The builder chrome around the preview stays English
  whatever the app does — that is not a bug in their app.
- **A partly-translated app falls back to the default language**, key by key. That is by
  design: a missing string shows English, not a raw key.
- **Scope it.** Count the catalogues before you start, say what one language costs, and add
  languages one at a time.

## Never

- Mount the provider in `main.tsx` or `vite.config.ts` — engine-owned. It goes in `App.tsx`.
- Add `react-intl`, an i18next BACKEND plugin, or a language-detector plugin. The resources
  are compiled in and `language.ts` already detects — those add an async story for nothing.
- Ship the default language's text under another language's folder name.
- Add `flex-row-reverse` to something already inside `dir="rtl"`.
- Branch on `lang === 'ar'` for plurals, dates or sorting — that is what `Intl` is for.
- Translate: catalogue keys, route paths, object/field API names, `data-test-id` values, env
  values, or console messages.
- Hand-edit a generated catalogue under `app/src/i18n/<default>/`. Change the English at the
  call site and re-run `bun run i18n`. Translations of OTHER languages ARE edited by hand —
  that is what `bun run i18n:sync` scaffolds them for.
- Promise a brand webfont for a non-Latin script.
