---
name: theming
description: How the app's colours, font and corner radius actually get set — the platform owns them, the engine bakes them into CSS, and you style through semantic tokens. Load this when the user asks to change the theme or branding, to switch or refresh a platform theme, when you are about to touch a colour/font/radius value anywhere, or when you need to know which token to reach for. Also load it before telling a user something about the theme cannot be done.
version: 9
---

# Theming — what you own and what you do not

The app's **palette, font and corner radius** come from a platform brand theme the user
picked. The engine fetches that theme, maps it to the shadcn token set, and writes it
into the app's CSS before every build. You do not choose these values and you cannot
edit them: the build re-renders that file, so a hand edit is gone by the next preview.

Everything else is still yours — layout, spacing, hierarchy, motion, interaction, copy.

The per-turn `[theme-lock]` block states the current values and their precedence. This
skill is the mechanics: which token to reach for, how to change a theme, and the traps.

## Changing the theme: two different asks

On a "[PLAN MODE]" turn, neither call happens. Both rebuild the app, and the user asked to
read the change before it happens — so a theme or colour request goes to `create_plan` as a
full plan, however small it looks. The rest of this section is for the turn they approve it on.

`set_app_theme` is the only way. Read which ask you have:

| the user says | call |
|---|---|
| "use the Ocean theme", gives an `e_theme` id | `set_app_theme(theme_id="e_69a…")` |
| "I updated our theme", "pull in the theme changes", "it doesn't match our branding" | `set_app_theme()` — **no arguments** |
| "make the buttons blue", "less rounded", "bigger headings" | NEITHER — see below |

The no-argument form re-reads the theme this app already follows. Themes are edited
outside the app, in the platform's design system, and the app does not follow those
edits on its own. **Do not ask the user for a theme id first** — the app knows its own.

A request to change ONE value ("make the buttons blue") is not a theme switch. The
theme is a shared brand asset; repainting it for one app is wrong, and editing the CSS
is reverted. Say the palette comes from the platform theme, name the theme, and offer
the two real options: switch to a different theme, or change it in the design system
and ask you to pull it in.

**Whatever changes the palette, the components have to follow it.** A theme switch, a
refresh, or an approved colour change only moves the tokens; a component carrying its own
`#hex`, `rgb()` or `bg-blue-600` keeps it, and the user sees "nothing changed". In the
same turn, grep `app/src` for fixed colours (`#[0-9a-fA-F]{3,8}`, `rgb(`, `hsl(`, `-[#`,
palette classes; skip the engine's theme CSS and prebuilt components like
`MapAreaTools`) and replace every match with the token for its role — all screens, not
one at a time. Leave logos, images and brand artwork alone. A request for one colour
("make the accent #FF6600", "make this button green") is the one-value ask above: answer
it that way, do not sweep the app, and never write that colour into a component.

## Which token to reach for

The engine emits the shadcn set. Use the semantic class, never a fixed colour — not
`bg-blue-600`, not `bg-[#1e40af]`, not `style={{ color: "#1e40af" }}`, not a hex typed
into a chart or map config (where a library cannot take `var(--…)`, read the token at
runtime, as the `maps` skill does). A fixed colour ignores the theme, so the next theme
change skips it:

- surfaces, page outward: `bg-background` → `bg-card` / `bg-popover` → `bg-muted` →
  `bg-secondary`. These map the platform's 4-step elevation ramp, so a card on the page
  and a muted panel on a card are always distinguishable.
- ink: `text-foreground` for body, `text-muted-foreground` for captions and secondary
  lines, `text-card-foreground` on a card. Never put `text-foreground` on `bg-primary`.
- brand: `bg-primary` + `text-primary-foreground`. `accent` is a RECESSED SURFACE, not a
  second brand colour — do not use it for a call to action.
- lines: `border-border`, and `border-input` on form controls.
- focus: `ring-ring`. It is the brand, and it is the one affordance keyboard users have.
- radius: the `rounded-*` scale, every step of it — bare `rounded` and the directional
  `rounded-t` / `rounded-bl` included. All of them resolve the theme's radius, which may
  be `0rem`: if the theme says square, the app is square.
- `rounded-full` is the one class that does NOT follow the theme — it is infinity, not a
  step on the scale. Reach for it only where the shape is genuinely a CIRCLE: an avatar,
  a status dot, a spinner, a round icon button. A text pill — a status badge, a priority
  tag, a chip — takes `rounded-4xl`, which is the same pill on a short element and goes
  square when the theme does. `rounded-full` on badges is how a square theme still ends
  up with a table full of round tags, and it is the last thing that gets missed.

**Every surface you draw needs one of those classes.** The theme's corner radius can only
reach a corner you asked to be rounded, so a card, panel, table wrapper, list row, chip
or tile written as a bare `<div className="border bg-card p-5">` renders square under
every theme — and beside a `<Button>`, which ships its own `rounded-lg`, it reads as the
theme half-applying. The shadcn primitives already carry theirs; anything you build out of
plain elements does not. Pick the step by size: a page-level card `rounded-xl`, a panel or
table `rounded-lg`, a chip or tag `rounded` / `rounded-sm`.

## Status colours — success, warning, destructive, info

**These always exist** — `src/index.css` ships all four families, in both modes, in
every app. Never write a raw green, amber, red or blue for a state; never approximate
one with `bg-green-500` or an opacity of the brand.

Where the values come from depends on the app. Under a platform brand theme (the
`[theme-lock]` block is in your prompt) they are that design system's Status colours,
per mode. Without one they are the design system's own defaults, baked into the
template — the same greens, ambers, reds and blues, so a theme picked later changes the
values and never introduces the set. Either way the class is safe to reach for and the
app never has to invent a green.

Each of the four has the same five classes:

| what you are styling | class |
|---|---|
| solid fill (badge, filled button, icon on a plain surface) | `bg-success` |
| ink on that fill | `text-success-foreground` |
| subtle surface (snackbar, alert, banner, tag) | `bg-success-subtle` |
| ink on the subtle surface — and the icon beside it | `text-success-subtle-foreground` |
| its border | `border-success-border` |

Swap `success` for `warning`, `destructive` or `info`. `destructive` is the error family;
it keeps shadcn's name, so existing `bg-destructive` styling is unchanged.

A snackbar / toast is the case this most often gets wrong, and it is wired for you:
`components/ui/sonner.tsx` already paints each state from these tokens. What you owe it
is the RIGHT CALL — the colour comes from the toast's type, not from the string:

```tsx
toast.success(t("saved", "Changes saved"))        // green
toast.error(t("saveFailed", "Couldn't save"))     // red
toast.warning(...) / toast.info(...)              // amber / blue
toast(...)                                        // NEUTRAL — an outcome must not use this
```

A bare `toast()` for "Saved" is the single most common way an app ends up with a wall of
identical cards: sonner types it `default`, the state classNames never apply, and success
and failure read the same. Reserve it for a note that reports no outcome.

Restyling that Toaster is fine — keep each state on its own tokens, and leave the BORDER
alone. Sonner declares `--success-border` / `--warning-border` / `--info-border` itself on
`[data-sonner-toaster]`, an ancestor of every toast, so those three names resolve to
SONNER's colours inside a toast no matter what the theme says. The surface and the ink
carry the state; `sonner.tsx` says the rest.

The same five apply to an alert, a status badge, a form-field error, a health dot, a
"3 failed" count. A theme that has not customised its Status section still gets the
design system's own greens/ambers/reds/blues — the same ones every other UnifyApps
surface shows, and the same ones an unthemed app carries — so these are always safe to
reach for.

## Type scale — headings, subtitles, body, paragraph, code

Under a platform brand theme, all five of the design system's type groups are the
theme's. Without one, only the Tailwind ladder below exists — `text-para-md` and
`text-code-xs` are not classes, and a bare `<p>` is whatever Tailwind makes it.

- **Headings and subtitles** are `text-2xl` … `text-7xl`. They already resolve to the
  theme's `display-*` sizes; keep writing them as usual.
- **Body** (UI text: labels, buttons, table cells) is `text-xs` … `text-xl`, plus
  `text-xsm` (13px), `text-xxs` (11px) and `text-xxxs` (10px) for dense UI only.
- **Paragraph** — prose — is `text-para-md` / `text-para-sm` / `text-para-xs`. This is
  NOT a duplicate of body: `text-para-md` and `text-base` are the same size and differ
  in leading. Running text gets a paragraph class; a label does not.
- **Code** is `text-code-xs` / `text-code-xxs` / `text-code-xxxs`, with `font-mono` for
  the theme's code face. **Anything showing code takes a `text-code-*` size — never
  `text-sm`.** An editor, a snippet, a diff, a log line, a terminal, a line-number
  gutter, a `<kbd>`: `font-mono text-code-xs`. `font-mono` alone gets you the face and
  leaves the size on the body scale, which is a different family and can be a long way
  off — one real theme states Body 4 at 10px and Code 1 at 12px in light, and 20px vs
  29px in dark. The other half fails too: a `text-code-*` step alone can leave the
  code in the body font, because a size class cannot carry a font — write the pair.
  The same holds on a `<Textarea>`: `className="font-mono text-code-xs"` takes your
  size, and it falls back to its own only when you give it none.

Under a theme, a bare `<p>` already carries paragraph metrics, a bare `<pre>` the code
size, and `<code>`/`<kbd>`/`<samp>` — and any element with a `text-code-*` class — the
theme's code face when it names one; the engine puts that in the base layer. So prose
and code are on-theme with no class at all, and you only reach for the utilities when
you want a different step. A `className` you add always wins over that default, so do
not put `text-sm` on a `<p>` out of habit.

**Never pair a theme step with `leading-*`, and never write a literal size.** A theme
step already carries its own line height, and `leading-6` sets the very variable that
line height falls back through:

```
.text-code-xs { font-size: var(--app-text-code-xs);
                line-height: var(--tw-leading, var(--app-text-code-xs--line-height)) }
```

so `text-code-xs leading-6` keeps the themed size and throws the themed leading away —
and a theme whose dark step is 29px on 44px leading then renders 29px on 24px, which
overlaps. The same goes for `text-[13px]` and any inline `style={{ fontSize }}`.

Two places this matters beyond looks: a code gutter and its editor must share size AND
leading or the line numbers drift out of alignment, and both are per-mode, so a
hardcoded leading that looks fine in light breaks the moment the user flips to dark.
Put the step on both and they stay locked together in either mode.

## What the theme does NOT give you

Reaching for these produces classes that resolve to nothing, or to Tailwind defaults:

- **alpha tokens.** Translucent brand steps are not mapped; use opacity utilities.
- **dark mode may be synthesized.** Many themes ship no dark values, so the dark shell is
  derived. Check both modes look right before you claim the app supports dark mode.

## Traps

- **Everything the theme sets can differ per mode — colour, text, font, border.** All
  four are edited per colour scheme in the theme manager, so check BOTH modes before you
  call a screen done: the type size, the corner radius and the typeface can each change
  when the user flips it, not just the palette. `text-sm` … `text-7xl` are the theme's
  own sizes where it states them.
- **Never write a literal radius**, the same way you never write a literal size:
  `rounded-[0.375rem]`, `rounded-[10px]` and `style={{ borderRadius }}` all pin a corner
  the theme can no longer move, and they survive every theme switch looking almost right.
  A radius that must not grow past some size is the one exception, and it is written
  `rounded-[min(var(--radius-md),10px)]` — capped, still themed, and still square when
  the theme is. That is what the small button and select sizes already use.
- **Never write a literal into `@theme inline`.** Tailwind copies a value there into
  every utility it generates, baking it in at build time, where no `.dark` rule can
  reach it — that is why the keys you see point at tokens instead: `--font-sans` →
  `--app-font-sans`, `--text-lg` → `--app-text-lg`, `--text-para-md` →
  `--app-text-para-md`, `--font-mono` → `--app-font-mono`, `--color-success` →
  `--success`. The per-mode values live in `:root` and `.dark`. The families also load via a
  `<link>` in `index.html`. All of it is engine-owned; do not touch it.
- **Do not add a weight axis to the Google Fonts URL.** One family that does not serve a
  requested weight 400s the whole request — every font on the page falls back to system.
- **Colours are OKLCH.** Expect the theme's own values in that form, including ones the
  theme authored directly. A colour literal in a component is still a bug in any form.
- **Never hand-edit** `theme.json`, the token block in the theme CSS file, or the font
  link. All three are re-rendered from the pinned theme on every build.

## When the theme itself is wrong

Follow it anyway. Contrast floors, "keep the accent rare", the corner-radius ceiling —
all suspended where they would change a themed value. The user's theme wins even when it
looks wrong to you.

The one exception: if two of its own colours are genuinely near-identical (body text on
its own background), still follow it, and add ONE short sentence to your final message
naming the pair. Do not fix it, and do not raise it twice.
