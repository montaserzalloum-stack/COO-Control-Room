---
name: design-system-telekom-ods
description: The Telekom ODS design system — Deutsche Telekom's own component library from the private @telekom-ods/react-ui-kit package (~208 components), with per-component docs in app/docs/design-system/. Load this when app/package.json depends on @telekom-ods/react-ui-kit: these apps have NO shadcn/ui and NO Radix, and their Tailwind is PLAIN Tailwind — no ODS token is mapped into its theme, so there is no bg-card and no p-component-3 class. The rule is a split: className carries Tailwind's own values (p-3, gap-2, rounded-lg, text-sm), and an ODS token is written out as var(--colours-basic-background-card) in a style attribute or a .css file, where the dependency is visible. It also carries this system's brand and theme policy, which is the opposite of the default one's.
version: 22
---

# Telekom ODS design system

**Which design system is this app on?** Check `app/package.json`:

| package.json has | design system | skill |
| --- | --- | --- |
| `@telekom-ods/react-ui-kit` | **telekom-ods** | this one |
| `tailwindcss` + `src/components/ui/` | **default** | `design-system-default` |

If it is not the telekom-ods one, stop reading — everything below is wrong for that app.

## This app is on the DEFAULT distribution — the one the Storybook documents

Telekom publishes the ODS kit twice, and this template now installs the same build the
Storybook at `ods.trap.ng.telekom.net` renders — the reference every designer and every
other Telekom product reads:

    @telekom-ods/react-ui-kit        @telekom-ods/design-tokens        (the DEFAULT skin)

So the Storybook is a TRUSTWORTHY reference for this app: its setup page prescribes
`core.css` + `schemes/default.css` + `typography.css` + `style.css`, which is exactly what
`src/main.tsx` imports.

**The one thing to be careful about is the opposite of what it used to be.** This template
was previously on the BASE skin (`…-base`), and **every "this component ships no CSS"
finding below was measured there.** They have NOT been re-measured on this build, and the
Storybook renders several of those components correctly — so a gap listed below may simply
not exist here. Check the component in the Storybook before you work around it, and say
which build you measured when you report one as broken. The same caution applies to the
CSS pins the template still carries (`.ODSTextField` width, `.ODSSheetOverlay` positioning
in `src/index.css`): if this build ships the rule, the pin now OVERRIDES correct styling
rather than repairing missing styling.

## What is different

| | shadcn app | this app |
| --- | --- | --- |
| Components | `@/components/ui/*` | `@telekom-ods/react-ui-kit` |
| Styling | Tailwind's stock scale | **the same** — plain Tailwind, nothing mapped |
| Spacing | `p-4`, `gap-2` | **the same** — `p-3`, `gap-2`, `rounded-lg` |
| Brand values | `bg-primary` class | `style={{ color: 'var(--colours-basic-accent)' }}` |
| Colour | `bg-primary`, `text-muted-foreground` | `var(--colours-basic-background-card)`, `var(--colours-basic-text-recessive)` |
| Type | `text-sm`, `font-bold` | `ods-typography-*` classes |
| Class helper | `cn()` (clsx + tailwind-merge) | `cx()` (clsx) |
| Primitives | Radix | ODS's own |
| Icons | lucide-react | `@telekom-ods/react-icons` (closed name set) |
| Theme | the planner picks a palette | **the brand IS the default palette — start there** |

There is no `src/components/ui/`. Tailwind IS here, and it is ONLY Tailwind:
`src/index.css` keeps Tailwind's stock theme and maps **nothing** onto it. `bg-card`,
`text-text-recessive`, `p-component-5`, `gap-layout-2` and `rounded-medium` are **not
classes in this app** — writing one styles nothing and fails no build. `p-3`, `gap-2`,
`rounded-lg`, `text-sm` and `flex` are Tailwind's own and work normally.

**The rule has two halves, and the split is the point.**

    className  ->  Tailwind's OWN values.  p-3  gap-2  rounded-lg  text-sm  flex
    ODS token  ->  style={{ }} or a .css file, written as var(--colours-basic-accent)

Everything in a `className` therefore compiles to a literal: a class that is in the markup
is a style that is on the page. Everything that depends on the ODS stylesheet says so, in
plain sight, at the point of use.

**Why, and it is not a style preference.** A mapped key produces a Tailwind-LOOKING class
that silently resolves through an ODS variable, and if that variable is missing the browser
drops the declaration — clean build, no console error, no styling. The template used to map
the spacing and radius namespaces, where Tailwind and ODS spell the names IDENTICALLY, so
Tailwind emitted `--spacing-component-3: var(--spacing-component-3)` — a property
referencing itself, invalid at computed-value time. That made the token undefined for the
whole page, **including inside every ODS component that reads it**, and apps shipped
completely unstyled with a passing build. Nothing is mapped now, so nothing can fail that
way again.

**In practice, in order:** reach for the ODS component's own `variant` / `size` / `mode`
prop first — it carries the brand's spacing and colour already, and then there is nothing to
match by hand. Use stock Tailwind classes for layout and geometry. Write a `var(--…)` only
for a brand value the component does not give you.

**One real cost, worth knowing before it bites:** a `style` attribute cannot express
`hover:`, `focus:` or `md:`. When a brand value needs a state or a breakpoint, put it in a
co-located `.css` file (`.profile-card:hover { background: var(--colours-basic-background-card-subtle) }`)
rather than reaching back for a utility class that does not exist.

**Colour and type are where the brand actually shows.** A stock Tailwind colour is not a
near-miss but a different brand (`bg-blue-500` is nobody's magenta) and it reads
immediately, where a 4px gap does not — so default to `var(--colours-…)` for colour and
the `ods-typography-*` classes for text. (`bg-card`, `text-text-recessive` and
`border-stroke-subtle` are **not classes in this app** — see above. They were, one
generation ago.)

Preflight is deliberately not imported (`tailwindcss/theme.css` + `tailwindcss/utilities.css`,
not `tailwindcss`). This app has its own reset, written for a tree where ODS styles its
components and nothing else; two resets disagreeing is a bug nobody thinks to look for.

**What that reset has to cover, and why you will notice if it stops.** ODS styles its own
components and NOTHING else, so every bare element the app writes arrives wearing the
browser's defaults. On a real generated app that meant: 13 of 13 links underlined (a whole
sidebar of nav items with lines under them), 6 of 12 buttons painted the UA grey
`#efefef`, `<input>`s in a 2px inset well, and every uncoloured border black. None of it
errors, none of it fails a build, and together it is most of what makes a generated app
look unfinished. The reset now handles link decoration, form-control background and
radius, `cursor` on buttons, and border width and colour. If you add a bare element and it
looks like 1997, that is this list — extend the reset rather than patching the call site.

**A border needs its colour named, and this is the one place the missing preflight shows.**
Tailwind v4's `border` / `border-b` / `border-r` set width and style but **not colour** —
v3's preflight pinned it to `gray-200`, v4 leaves it at `currentColor` — and here
`currentColor` is `--colours-basic-text`, which is `#000`. So an uncoloured border class
draws solid black. Pair the width class with the token:

```tsx
<div className="border-b" style={{ borderColor: 'var(--colours-basic-stroke-subtle)' }}>
```

For reference, `--colours-basic-stroke-subtle` is `#828282` in the white scheme and
`--colours-basic-stroke` is `#000000` — verified against Telekom's own Storybook at v3.1.2,
where the Table component draws exactly that. Neither is a bug.

**The border colour is a design decision, and you are not restricted to the tokens.** Pick
whatever the design calls for — a token, a derived `color-mix()`, or a colour of your own.
A status tile's edge may take its own family, a selected edge may take the accent, a rule
inside a tinted band may be lighter than any token offers. Use your judgement about what
the screen needs.

One thing to know rather than obey: a token or a `color-mix()` of one re-resolves when the
page renders in the `black` scheme, and a fixed value does not. If the screen you are
building is only ever shown in one scheme that costs nothing; if it can be inverted, prefer
something that moves with it.

`--colours-basic-stroke` is near-black and belongs to a deliberately high-contrast state
only. `--strokes-1/2/3` are **widths**, not colours, so `borderColor: 'var(--strokes-1)'` is
an invalid declaration the browser drops in silence.

The template's reset now does preflight's border job (`border-width: 0` plus
`border-color: var(--colours-basic-stroke-subtle)` on `*`), which kills the UA button
border and makes an uncoloured Tailwind border default to the hairline instead of black.
Do not remove it: a bare `<button>` without it renders Chrome's `2px outset` black border,
which is what made generated apps look outlined in ink. Do not "tidy" it into preflight's
`border: 0 solid` shorthand either — forcing `border-style: solid` globally makes every
width-only border on the page start painting, which on a real app added 8 new black edges
while fixing the buttons.

## The theme rule is the opposite of the default one's

On the default design system the planner chooses fonts, palette and radius, and a generic
palette is the failure mode. **Here the brand is where you START, so there is nothing to
invent unprompted.** The palette, type scale, spacing and radius are Deutsche Telekom's
and arrive whole from `@telekom-ods/design-tokens`:

- Accent: Telekom Magenta `#E20074` (`--colours-basic-accent`)
- Typeface: TeleNeo, loaded by the package's own `@font-face` — no `<link>`, no font host
- Neutrals, functional colours, radius and stroke scales: all tokens

Reach for `var(--colours-basic-accent)` rather than `#E20074`, and prefer a token over a
colour of your own. Unprompted invention is what that is against.

**It is a default, not a cage — and you are still the designer. That holds for EVERY brand
value, not just colour.** A rose palette, a gradient hero, a tinted surface no token names;
a tighter grid, a wider gutter, more generous section margins, a softer radius, a larger
display size: build it when the user asks for it, and build it when the screen needs it to
be good. Refusing and citing the design system is the wrong answer every time, and so is
shipping something cramped or flat because no token covered it.

Where the departure lives depends on which value it is:

- **Spacing, margins, radius, layout** are plain Tailwind here already — `p-6`, `gap-10`,
  `mt-16`, `rounded-2xl`. Nothing to override and nothing to ask: write the value the
  design needs. The brand's steps are a starting rhythm, not a permitted set.
- **A brand VARIABLE** (colour above all) is the one needing care. Redefine it in ONE
  place — `:root` in `src/index.css`, the file already holding this app's local fixes — so
  every component repaints through the variable it reads anyway, instead of a hex at each
  call site. The engine's theme pass merges by key and leaves declarations it does not
  name alone, so an override there survives the next build. Check it took (an ODS
  `[data-scheme]` block can out-specify a bare `:root` — scope to the same attribute or a
  wrapper if so).

Then say which brand values you moved off, and why.

What genuinely cannot reach this app is a platform theme pinned by the TENANT: the engine
renders it into `src/index.css` as `--primary` / `--background`, which nothing on this
stack reads. That is a plumbing gap, not a brand rule — say so, and offer to apply those
colours as ODS token overrides instead.

Inverted sections use `data-scheme` on any ancestor, which re-points every `--colours-*`
below it:

```tsx
<footer data-scheme="black">…</footer>
<section data-scheme="magenta">…</section>
```

## Look the component up in the app's own docs first

`app/docs/design-system/` — **one page per component**, each with the full prop table,
generated from the installed package's own type definitions. `README.md` is the index
(grouped by what you are looking for), `colors.md` and `tokens.md` carry the token tables.

Each page now also carries an **Example**, **When to use** and **When not to use**,
scraped from the ODS Storybook (122 components, 115 examples) — the npm package ships no
stories or MDX, so this is the only place that prose exists. Two caveats: the snippets
come from the DEFAULT-skin Storybook while the prop tables are generated from the
installed BASE `.d.ts`, so a snippet can name a prop this build does not have — the prop
table is the authority; and refreshing them is a browser job, not a `bun run`, because
the Storybook is behind Telekom SSO.

**Before you use a component, read its page.** `view app/docs/design-system/ODSButton.md`.
This is not optional politeness: several of these fail *silently* when guessed at, and the
build stays green while the screen is wrong.

- **`ODSButton` takes `label`, not children.** `<ODSButton>Save</ODSButton>` renders an
  empty button.
- **`ODSTextField` requires `labelText`** and owns its own label — do not pair it with a
  separate `<Label>`, or the text renders twice. Native input attributes
  (`onChange`, `id`, `autoComplete`, `type`) go in **`inputProps`**, not at the top level.
- **`ODSFlyoutMenu` renders `items`**, not children — children are dropped.
- **48 components ship NO CSS AT ALL on THIS (base) build, and you have to check before you pick one.**
  Not a gap to patch — 100% of the variables they read are unassigned in `react-ui-kit`,
  so they render with
  no geometry whatever: no border, no padding, no height. `app/docs/design-system/layout-gaps.md`
  opens with the full table; read it before reaching for anything unfamiliar.
  The ones that bite:
  - **Date and time entry is entirely unusable** — `ODSDatePickerInputField` (71 variables
    read, 71 unassigned), `ODSDatePickerFlyout` (85), `ODSDatePickerDay` (48),
    `ODSTimePickerInputField` (76), `ODSTimePickerFlyout` (41). The field has no box and
    its floating label keeps `top: 0`, so the label prints on top of the value — two
    strings overlapping, with a green build. Use a native `<input type="date">` styled
    from the tokens.
  - **Half the card family** — `ODSCardWidget` (174!), `ODSCardProduct`, `ODSCardFeature`,
    `ODSCardPromo`, `ODSCardQuickAction`, `ODSCardCheckmark`, `ODSCardCheckmarkImage`,
    `ODSCardChoiceImage`, `ODSCardChoiceV2`, `ODSCardAnchoredImage`. The ones that DO
    ship: `ODSCardBasic`, `ODSCardImage`, `ODSCardNotification`, `ODSCardCarousel`,
    `ODSCardChoice`, `ODSCardChoiceSimple`, `ODSCardContentBasic`, `ODSCardEngagement`,
    `ODSCardSwitch` — plus `ODSBox`, `ODSTable` and `ODSAccordion`. Reach for those.
  - **Dropdown and panel surfaces** — `ODSContentPanelDesktop` (35), `ODSContentPanelMobile`
    (26), `ODSPickerDropdownItem` (23). An open picker list draws no border, no shadow and
    no background, so its options sit straight on the page content behind them.
  - Also empty: `ODSCombobox`, `ODSSearchInput`, `ODSInlineSearch`, `ODSInputStepper`,
    `ODSRadioGroup`, `ODSSegments`, `ODSFileUpload`, `ODSUploadBox`, `ODSSkeleton`,
    `ODSTableHeadCell`, `ODSNonmodalDialog`, `ODSProgressStepper`, `ODSChatBubble`.
  Two traps worth naming: `ODSCardWidgetDeprecated` and `ODSCardQuickActionDeprecated`
  ARE styled while their replacements are not, so the deprecated one is the working one;
  and this is NOT the repairable gap described below — patching one of these from
  `src/index.css` means authoring the component.
- **`ODSDialog` is controlled by `open`** — do not also gate it behind `{isOpen && …}`.
- **A component's tokens can ship inside ANOTHER component's stylesheet.** The dropdown
  panel reads `border: var(--ODSMenuListContainer-border) var(--colours-basic-stroke, #000)`
  — and that first variable is assigned in `assets/ODSMenuListItem.css` and
  `assets/ODSFlyoutMenu.css`, not in any file named for the container. ODS components
  import their CSS from their own JS, so an app only loads stylesheets for the components
  it actually renders: a dropdown built with `items` renders `ODSPickerDropdownItem`,
  never `ODSMenuListItem`, so the token never arrives. The first `var()` carries no
  fallback, so the whole `border` shorthand is invalid and the panel loses its border,
  radius and shadow together — reported as "no border", and correct in the Storybook,
  which renders `ODSMenuListItem`. Repaired in `src/index.css`.
  **`layout-gaps.md` cannot find this class of bug**: it reads each stylesheet on its own
  and sees the variable assigned somewhere in the package. Whether it reaches the browser
  depends on which components you import, which is a runtime fact, not a CSS one.
- **`ODSSheet` is repaired in `src/index.css`, and its TITLE is a hero size.** The package
  declares no inset or alignment for the sheet and leaves its overlay `display: block`, so
  the drawer used to land at its static position — measured 466px down a 932px viewport
  with 418px, action buttons included, below the fold. The template now makes the overlay
  a flex container, which pins it right at full height; do not undo that. What it does NOT
  fix is the title: `--ODSSheet-TitleLabel-font` is a display clamp rising to **4.25rem**,
  which inside a 605px drawer reads as a hero headline. Override it on the sheet when the
  title is a form heading rather than a statement.
- **An EMPTY `ODSTextField` renders its label at 32px/800.** `--ODSTextField-Label-font--size-*--status-*`
  is unassigned, so an unfilled field falls back to a display weight while a FILLED one
  resolves to 16px/700 and a textarea's to 20px/400 — three label treatments in one form,
  which is what makes a plain drawer look broken. Assign the variables in `src/index.css`
  beside the other repairs if a form shows it.
- **Icons: read `app/docs/design-system/icons.md`.** See the section below — this is the
  single most expensive thing to work out from scratch, and it is already written down.
- **`ODSIcon` is in `@telekom-ods/react-icons`**, not the component kit. The kit re-exports
  only the `ODSIconName`/`ODSIconProps` TYPES, so importing the component from it
  type-checks and is `undefined` at runtime.
- **The notification components accept no `role` and set none.**
  `ODSInlineNotification`, `ODSNotification`, `ODSBanner` and `ODSToast` all omit it, so an
  error is rendered and never announced. Wrap it:
  `<div role="alert"><ODSInlineNotification …/></div>`.
- **Severity is the `mode` prop, and there are FOUR of them** — `error`, `warning`,
  `success`, `informative` — which is what picks the icon and the colour. `variant`
  (`banner` / `inline` / `toast`) is the SHAPE, not the severity, and `type` is the
  deprecated spelling of `mode`. Pass it, and pass it through your own helpers: the
  template's `toast()` takes `mode` in its options for exactly this. An app that leaves it
  off renders every error as a neutral note — one shipped that way and told its user
  "Telekom's pop-up messages only come in two styles, so warnings and errors look the same
  as neutral notes", which is not true of the kit, only of the call it made.
- **A component that renders WRONG rather than broken is a known packaging gap, not your
  CSS.** The stylesheet is generated from Figma variants, and ~546 variables are read by a
  declaration and never assigned anywhere in the package; each one makes its declaration
  invalid, so the property silently falls back. `app/docs/design-system/layout-gaps.md`
  lists them and `src/index.css` already fixes `ODSTextField`.
  **Read that page as covering any property, not only width.** It is titled for the size
  case because that is how it was found, and the gap is not limited to it — measured on a
  live app, `ODSDatePickerInputField-Label` reads `position`, `top`, `font`,
  `white-space`, `overflow` and `text-overflow` and the package assigns NONE of them, so
  the floating label never floats or shrinks: it keeps `top: 0` and the 16px body font and
  prints **on top of the field's own value**, two strings overlapping. The component's JS
  is fine — it sets `--status-filled` correctly — and the build is green.
  So: when a component looks wrong and your own CSS does not explain it, check whether the
  property it is getting wrong is read from an unassigned variable before you fight it
  with overrides. The fix is assigning that variable in `src/index.css`, next to the ones
  already there.

## Icons — one file, read once

`app/docs/design-system/icons.md` is the icon name list. Read it the first time a screen
needs an icon, keep the names in mind for the rest of the turn, and do not go looking for
them anywhere else.

```tsx
import { ODSIcon } from '@telekom-ods/react-icons';

<ODSIcon name="arrow-left-type-standard" />
```

Names are a closed union (`ODSIconName`) shaped
`<name>-type-<standard|bold>[-size-small]`. **The shape is not enough to invent one from**
— `arrow-left-type-standard` exists, `arrow-back-type-standard` may not, and there is no
signal when you get it wrong: an unknown name renders nothing, throws nothing and fails no
build. It ships as a blank space in the UI. Copy a real name out of `icons.md`.

**Do NOT do any of these** — each was measured re-deriving a list that is already on disk:

- `grep`/`find` in `app/node_modules/@telekom-ods/**` for `ODSIconName`
- opening `react-icons/dist/ODSIcon.types.d.ts` or `dist/index.d.ts` to read the union
- `bun -e 'import * as icons from "@telekom-ods/react-icons"'` to enumerate exports
- reading any of the above a second time in the same turn

If `icons.md` has no name table yet, it says so: run `bun run docs:design-system` ONCE,
which regenerates it from the installed package, then read the file. One command, one
read, for the whole turn — not once per screen.

When no name fits, do not substitute another icon library (`lucide-react`, `react-icons`,
heroicons) and do not inline an SVG to stand in for a missing one. Say which icon you
wanted and use the nearest real name, or leave the affordance text-only.

## Charts — ODS first, recharts for the rest

ODS ships charts and they are already installed: `ODSBarChart` and `ODSLineChart` from
`@telekom-ods/react-ui-kit` (chart.js + react-chartjs-2 arrive as its own
dependencies, so there is nothing to add). Their `scheme` prop carries the Telekom colour
schemes, which is the whole reason to prefer them — a bar chart built anywhere else has to
be coloured by hand and will drift off-brand.

```tsx
import { ODSBarChart } from '@telekom-ods/react-ui-kit'
```

`CustomChartData` / `CustomDataset` are the chart.js data types re-exported with `scheme`
on them. `app/docs/design-system/ODSCharts.md` is the page.

**recharts is in `package.json` for the shapes ODS has no component for** — pie, donut,
area, scatter, composed, radar, treemap. Use it there and nowhere else.

When you do, colour it from the ODS tokens. There is no `--chart-1..5` on this stack — that
belongs to the default template — so read the real ones off the document:

```ts
const css = getComputedStyle(document.documentElement)
const accent = css.getPropertyValue('--colours-basic-accent').trim()
```

Never a hex literal, and never a recharts default palette: both put an unrelated colour on
the screen, and nothing in the build will object. Reading the token is also what carries a
deliberate palette change to the charts for free — redefine the variable, and this picks it
up with no second edit.

## What ODS does not ship

Four primitives are authored in `src/components/` on top of ODS components and tokens,
because the library has no equivalent. Use these rather than rebuilding them:

| component | why |
| --- | --- |
| `Label` | ODS folds labels into each field; this is for a custom control or a group caption. |
| `PasswordInput` | ODS has no show/hide affordance — this is `ODSTextField` + its own right-icon button slot. |
| `ScrollArea` | ODS has no scroll container; this styles the NATIVE scrollbar to the theme (no JS, no custom thumb). |
| `Toaster` + `toast()` | `ODSToast` is the visual only — no queue, no imperative API, no portal. |

`<Toaster />` is already mounted in `main.tsx`; call `toast('Saved')` /
`toast.success(…)` / `toast.error(…)` from anywhere.

Anything else you are missing is probably there — check the index before writing a new
component. Cards alone have ~30 variants.

**When nothing in the kit fits the design, write the component.** That is exactly what
those four are: ODS primitives and tokens composed into something the library did not
ship. The kit is an inventory, not a ceiling — and a near-miss component bent into shape
with overrides is the worse outcome, because it reads as off and nothing reports it.
Compose from ODS parts where they exist (`PasswordInput` is `ODSTextField` plus a
right-icon slot), fall back to plain markup styled from the tokens where they do not, keep
it in `src/components/` beside the others, and say what you added and why the nearest
ODS option did not fit.

**The order matters: a kit component, then kit components composed, then your own.** This
is the last step, not the first. Reaching for it early is how an app ends up with the kit
on its buttons and bespoke CSS everywhere else — see "Writing CSS" for what that produced.

## Writing CSS

**Reach for a utility first.** Layout and one-off spacing belong in `className` —
`flex flex-col gap-2 p-6 rounded-lg` with `style={{ background: 'var(--colours-basic-background-card)' }}`
— stock utilities for the geometry, an explicit `var()` for the brand colour, no file needed. The five-route app that
prompted this rule wrote 232 CSS rules across five files, 39 of whose declaration blocks
were byte-identical to another; `display:flex; align-items:center; gap: var(--spacing-component-3)`
appeared seven times. That is `flex items-center gap-2`, written once per use.

So: `gap-2`, `p-6`, `rounded-lg` in `className` — and for a brand colour,
`style={{ color: 'var(--colours-basic-text-recessive)' }}`, never `text-gray-500` and never
`text-text-recessive`, which is not a class. Geometry sized by eye against ODS components is
close enough; a colour picked by eye is not, which is why the token is worth the longer
spelling.

Prefer an ODS component's own `size` / `variant` prop over any padding or colour you write
yourself — the component already carries the brand's values, so there is nothing to match.

**Before any of that: is the thing you are about to style a component the kit already
ships?** CONTENT is where this gets missed. The controls are easy to reach for — Button,
DropdownSelect, TagStatic, Link, Icon — and then the stories, panels, sections and tables
*around* them get hand-built out of `<div>`s and a stylesheet. Measured on a live briefing
app: **49 ODS elements, every one a control or nav chrome, against 57 plain structural
elements carried by 48 hand-written rules across four `.css` files** — no `ODSCard`, no
`ODSBox`, no `ODSAccordion`, no `ODSBanner` anywhere, while ~30 card variants sat unread in
`app/docs/design-system/`. Nothing was broken, nothing was off-brand and every token
resolved; it simply looked like an unstyled document, because the kit's visual language
never reached past the buttons. **A container, a panel, a story, a callout, a stat, a row
of records — look those up before you style a `<div>`**, and check the component against
`layout-gaps.md`'s unavailable table first: `ODSCardBasic` ships its CSS, `ODSCardWidget`
ships none, and picking the wrong one lands you back at an unstyled box.

Type is the exception with no stock fallback worth taking: use the `.ods-typography-*`
classes rather than `text-sm` / `font-bold`, which carry a scale ODS did not choose.

**Then a co-located `.css` file** for what utilities genuinely cannot express: a
`::before`, a keyframe, a container query, a component that needs a real cascade. Same
rule as before — beside the component that imports it (`Toaster.tsx` / `Toaster.css`),
written against the tokens:

```css
.step-list li::before {   /* no utility writes ::before */
  content: counter(step) '.';
  color: var(--colours-basic-accent);
  margin-inline-end: var(--spacing-component-3);
}
```

**If the block you are about to write is padding + gap + border + radius + background, stop
— you are hand-rolling a card**, and the kit ships about thirty of them. That shape is the
tell, and it is how four stylesheets get written one reasonable-looking rule at a time.

**An invented token name paints BLACK, and nothing tells you.** This is the single most
expensive mistake available on this stack, so learn the failure first: when `var()` names a
custom property that does not exist and you gave no fallback, the declaration is *invalid at
computed-value time*. It is not ignored — ignoring would leave the previous value. The
property is set to **`unset`**, which for `border-color` means `currentColor`, i.e. the text
colour, i.e. **`#000`** on this brand. On `background` it means transparent; on `color` it
inherits. No console error, no failed build, and DevTools' Styles pane still shows your
declaration sitting there looking live — only Computed tells the truth.

A real example, measured on a generated dashboard: **131 inline uses of six token names that
do not exist.**

```
--colours-functional-informative          54 uses   ❌
--colours-functional-informative-subtle   28        ❌
--colours-functional-warning              27        ❌
--colours-functional-success              11        ❌
--colours-functional-danger                8        ❌
--colours-functional-danger-subtle         3        ❌
```

Every card using one for `border-color` drew a black outline. What made it so hard to see is
that `--colours-functional-warning-subtle` IS real, so the card's background tint arrived
normally and only its border went black — a half-working family reads as a styling mistake,
not a typo.

The two traps in those names, both one letter from right:

- **the base colour is `-standard`, not the bare name.** There is no
  `--colours-functional-warning`; it is `--colours-functional-warning-standard`. The
  variants are `-standard`, `-subtle`, `-hovered`, `-pressed`.
- **ODS says `destructive`, not `danger`, and `informational`, not `informative`.**

The four functional families are `destructive`, `warning`, `success`, `informational` — plus
`--colours-functional-notification-notification` and `-text-on-notification`, which really are
spelled that way. **Read `app/docs/design-system/colors.md` and copy the name; never pattern-match
one from a family you have seen.** If you want insurance while developing, give the var a
fallback (`var(--colours-functional-warning-standard, hotpink)`) — a wrong-but-loud colour
shows up instantly, where black hides among the borders you meant to draw.

**Magenta is a SPOTLIGHT, not an "interactive" colour. One primary action per screen.**
`#E20074` is the loudest colour Deutsche Telekom owns, and the failure mode is using it for
everything clickable. Measured on a generated ITSM dashboard: **27 magenta-filled elements
on one screen**, twelve of them an identical `Triage →` button repeated down a table — a
wall of magenta in which nothing reads as important, including the one button that was.

- **One** filled-magenta action per view: the thing you want the user to do. On that page it
  was `+ Log Incident`, and it was drowned by twelve row buttons shouting equally loudly.
- **Row and table actions are quiet** — text or ghost, in `--colours-basic-text-link` or
  plain text with the chevron. They are reachable, not advertised. If every row has one, it
  is not a call to action, it is a column.
- **Never spend the accent on data.** A progress bar, a severity pill, an uptime figure and a
  countdown are information: they take the functional colours
  (`--colours-functional-*`), never the brand. When the SLA bar, the severity pill and the
  submit button are all magenta, the user cannot tell urgency from chrome.
- Secondary actions take `--colours-basic-accent-secondary` or an outline, not a lighter
  magenta. A tinted magenta surface (`rgba(226,0,116,0.1)`) is a SELECTED state, not a button.

**Style peers the same way, or the difference means something.** The same dashboard gave four
severity levels four different treatments — `P1 CRITICAL` as plain text, `P2 HIGH` as a
filled pink pill, `P3 MEDIUM` plain again, `P4 LOW` a filled green pill — so the most
severe row carried the LEAST visual weight, which is worse than no styling at all. Same for
its status column: two of the four values were pills, two were bare text. Pick one shape for
a column of peer values and vary only the colour, on the scale the data actually has.

Use logical properties (`padding-inline`, `inset-inline-end`) so RTL mirrors with no extra
rule. Text styles are classes, not tokens, in CSS and in `className` alike:
`className="ods-typography-subtitle"`.

Give every positioning `var()` its token's own fallback (`var(--spacing-layout-1, 1rem)`).
An undefined custom property reverts an inset to `auto`, which drops a `position: fixed`
box back into the document flow on top of the page. Colour and type get no fallback: a
missing token there means the ODS stylesheet never loaded, and that should stay visible.

## Regenerating the docs

```bash
bun run docs:design-system
```

After bumping `@telekom-ods/*`. Never hand-edit a prop table or a colour swatch — the one
thing worse than no reference is a confident wrong one.
