---
name: best-practices
description: Thirteen code shapes that keep shipping wrong in built apps — the signed-in user hardcoded instead of read from user context, dates and ranges written down at build time instead of derived from the clock, a figure, id or status written into the screen instead of read from the data, related-record ids leaking into the UI, forms with no validation or invented values pre-filled into their inputs, saves that leave the list on screen stale, a success message for a write that never happened, charts with no legend, stat cards that print every digit instead of a compact figure, a filter widened or dropped because it matched nothing, hand-rolled or misaligned dropdowns, dialogs that never close after a successful submit, and a mobile-only drawer hidden with `lg:hidden` that blurs and freezes the desktop page. Each one compiles and looks plausible, so the build gate never catches it.
version: 25
---

# Best practices — the defects that pass the build

Every rule below comes from a shipped app that was filed as a bug. Each one **compiled,
rendered, and looked plausible**, so neither the build nor the design check caught it. You
cannot open the app to check your work — these are rules about the code you write, not things
to verify afterwards.

## The signed-in user is fetched, never written

Whoever is using the app is never a literal in the code. No
`const CURRENT_USER = { name: 'Sarah Chen', … }`, no `'Demo User'` in the header, no
initials baked into an avatar, no user id pasted into a "my tickets" filter, and no persona
PICKER standing in for signing in. It renders perfectly on your screen and is wrong for
every real person who opens the app.

On a PRIVATE app (the default) one call carries all of it — `useGetApiUserContext` from
`@unifyapps/app-builder-sdk/hooks/user`: name, email and avatar on `data.user`; the viewer's
id at `data.user.id`, which is what a "mine" filter reads and what every `author` / `owner` /
`createdBy` / `assignee` stamp writes at submit time; the tenant on `data.customer`; roles
under `includeRoles: true`. Load the `authentication` skill before wiring it — it has the
query options, the logged-in gate, and the PUBLIC-app case, where there is no viewer to read
and you render the anonymous state rather than invent someone.

A fallback is the same bug with an extra step: `user?.name ?? 'John Doe'` paints a fake
person every time the query is pending or fails. Render a skeleton, or nothing, until it
resolves.

Fictional people in SEEDED rows are fine — that is sample content. The line is what the app
calls *the person reading it*.

## Dates and times are derived at runtime, never written down

Anything whose correct answer depends on WHEN the page is open is computed when it is opened.
The test: if you can write the value into the source, it is already wrong tomorrow —
`const TODAY = '2026-10-08'` and a saved "3 days ago" fail it the same way. Derive from
`Date.now()` at the point of use, never into a module-level `const`. A date in the brief or the
plan is an example of the shape, not a value to paste.

`new Date().toISOString().slice(0, 10)` is the **UTC** day — yesterday in IST until 05:30. Build
a local calendar date from `getFullYear()`/`getMonth()`/`getDate()`; keep `toISOString()` for an
instant you store or send.

## A value on screen is read, never written

The same rule, for everything else the screen presents as the reader's own — an id, count,
status, score or "live" badge. It is a value the app READ, or one computed from what it read;
a literal written to fill the space is indistinguishable, to the reader, from one their data
gave. Where the data cannot answer — the call failed, has not returned, or left the field
empty — the screen says which: the error, a skeleton, or what is missing (`—` in one field;
"Not available — needs <field>" or "No runs yet" for a figure or a section), never a plausible
stand-in. A literal behind a condition is the same literal: `total || 1200`, `total ?? 1200`, a
`.catch()` that sets a sample result. Seeded rows are sample content, as above — but a badge
calling the data live, measured or synced is a claim about their data, and needs the same
backing as a number.

Motion is a claim too. A spinner, pulse or progress bar says something is in progress right
now, so it runs only while the data says so: a row whose status is in flight, a count above
zero, a request still pending. A status shown as a category (a summary card, a filter chip, a
legend, a column header) heads its rows whether there are any or not, so it is drawn still
unless its count is above zero. A badge that animates one status takes that condition from its
caller, `<StatusBadge status="sending" active={count > 0} />`, and does not read it off the
status name, or a "Sending" card over 0 rows spins as if mail were going out.

## A filter that matches nothing shows its empty state

An empty result is a correct answer. Never widen a filter, drop it, or fall back to the
unfiltered set because it matched nothing — that shows every record as meeting a condition
none of them met, which reads as data and is worse than an empty screen. Views slicing one
collection by the same dimension share their predicate inputs or they disagree: for time, one
date accessor and one clock, each deriving its own window. One app's Week read "0 records"
every day while Today, its filter dropped, listed all of them as today's.

## Show the name, act on the id

A field that points at another record stores that record's **id**. Render the related
record's **name** — never the raw id (`e_…`, a uuid, a numeric key). "Stage: e_6a98…" means
nothing to the person reading it.

Resolve it from data you already have: load the related list once, build a `Map` from id to
record, and look each row up. Never fire one request per row.

Every create, update and delete still sends the **id**. Name for the eye, id for the wire.

**Any list the user can edit is a lookup, not an enum.** If the options are records someone
can add, rename or delete — statuses, stages, sources, categories, tags — then choosing one
is a reference and the field stores its **id**. Storing the chosen TEXT instead looks
identical on screen and passes every check, right up to the first rename: the option row
changes, every record that copied the old text keeps it, and those records now point at
something that no longer exists. Deleting an option does the same, so count what still uses
one and tell the user, rather than silently orphaning their rows.

A deliberate historical snapshot is the exception — the price on a past invoice should not
move when the price list does. That is a copy on purpose; a lookup is not.

## A condition on a change is checked where the change is made

A condition the screen shows for a change ("complete every required step") is checked in the
`src/data` hook that makes the change, which every control goes through and which says what is
still missing — never only on one button. One app gated "Advance Stage" on it while "Start
Application" called the same automation unchecked.

## Forms

For forms where the user enters their own data — see the exception at the end.

- **A form opens holding only what the record or the brief supplied.** An edit form carries the
  row's own values; a create form starts empty and shows its example as a placeholder
  (`placeholder`; telekom-ods spells it `placeholderText`, and its textarea has neither — there
  the label carries the hint). What a form never opens with is a literal the model wrote:
  `useState('Delaware, USA')`, or `defaultValue="Either party may terminate…"` on a form
  control, stores that text for everyone who doesn't retype it, and a user who skims the screen
  and presses Save files it as their own record. A reason or justification for THIS action
  starts empty even when the record holds the previous one. Nothing is substituted on the way
  to storage either — `approverName.trim() || 'Finance Approver'`, or an
  `approverName = 'Jane Miller'` default parameter one layer down, files a record under a name
  nobody typed: block the submit, or send nothing and let the server stamp it. A value the
  record lacks shows `—` where it is displayed and leaves an input empty.
- **Validate before submitting.** Every required field filled, and every field whose NAME
  implies a format checked against that format — not only the ones the brief called out.
  Hoist each pattern as a named constant beside the form:
  - email → `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
  - phone or mobile → digits, spaces and `+ - ( )` only, 7–15 digits once stripped
  - a number field → a number, and inside whatever range makes sense; a date → a real date
  An **optional** field is still format-checked once the user types in it: optional means it
  may be left empty, not that anything goes. A field labelled "Mobile number" that accepts
  `cmdefl` is the most-reported form bug here, and it is reported as "the app is broken".
- **Put the failure on the field.** Set `aria-invalid` on the control and render the message
  directly beneath it in `text-sm text-destructive`, tied to the control with
  `aria-describedby`. `Input`, `Textarea` and `SelectTrigger` already style `aria-invalid` —
  setting it is all it takes to make the error visible. A single banner at the top of the
  form, or a Save button that silently does nothing, leaves the user hunting for which field
  is wrong.
- **Validate on submit; on blur only for a field the user actually CHANGED.** Touched means
  edited, not visited. The shipped failure is blur alone marking the field:

  ```tsx
  onBlur={() => setTouched((t) => ({ ...t, email: true }))}   // ✗ visiting is not editing
  ```

  Click into a field, click back out, and "Email is required" appears under something nobody
  typed in; tab once through a fresh form and every field turns red before a single character
  is entered. That gets filed as "the form validates as soon as you click it", and it is the
  most-reported form bug after the format checks above. Keep the two facts apart — changed,
  and left:

  ```tsx
  const [edited, setEdited] = useState<Record<string, boolean>>({})
  const [blurred, setBlurred] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)
  const showError = (f: keyof typeof errors) =>
    Boolean(errors[f]) && (submitted || (edited[f] && blurred[f]))
  ```

  `onChange` (or `onValueChange`) sets `edited`, `onBlur` sets `blurred`, the submit handler
  sets `submitted`, and both `aria-invalid` and the message read `showError(f)` — nothing
  reads a bare `touched`. A form nobody has edited or submitted shows no errors at all, and
  the error still has to appear as the user leaves a field they filled in, not only when they
  press Save: a `validate()` that runs solely in the submit handler is half the rule.

  Never surface a field's first error mid-typing. Once a field is already showing one, keep
  re-checking as they type so it clears the moment the value is right.
- **Mark required fields in the label**, and keep every entered value when a submit fails.
- **The submit handler always runs**: `preventDefault`, validate, then either submit or set
  the errors. Disable the button only while the request is in flight — never as the way to
  block invalid input. A dead button with no message reads as a broken app, and that is
  exactly how it gets reported.

**Not the sign-in form.** Username and password there are never format-checked (see the
`authentication` and `password-policy` skills) — validating them locks people out of their own
app. Free-text notes fields are never format-checked either.

## Say "saved" only after it is saved

Show a success message only after the call that stores the value has returned. Updating the
screen early is fine, but it is not the save — and neither is a log or audit call.

If a save or load fails, show it: `toast.error()` for a save, an error state for a load. Don't
navigate away, close the dialog or show success. Leave a `catch` empty only for background
work nobody is waiting on.

## A write refreshes what it changed

A save and the list it changes are the **same POST to the same endpoint** — only the
dataSource id in the body differs — so React Query files them as two unrelated cache entries
with nothing linking them. A create that does not say what it changed saves the record and
leaves the table showing the rows it already had, until someone reloads the page. It
compiles, the build passes, and it looks right in a screenshot.

Every create, update and delete refreshes the object it wrote, from the hook's
`mutation.onSuccess` — plus any other object a screen on that page derives from it, such as
an audit trail or a count. Nothing can work that second link out for you.

An automation that changes records refreshes them the same way, and this is the case that
gets hand-written: the write hooks are not involved, so there is no `onSuccess` to ride on.
Call `useRefresh(...objects)` from `@/data` after the automation resolves.

Never hand-write the `queryKey`. A read is filed under the execute-node endpoint plus the
whole request payload it was sent, never under a name, so
`invalidateQueries({ queryKey: ['storage', 'ticket'] })` matches nothing — and matching
nothing is not an error. The save lands, the call returns, the list keeps showing the rows it
already had, and there is no failure anywhere to find. `useRefresh` matches on the real key
shape, which is why it is the only correct way to say "re-read this object".

A bare `queryClient.invalidateQueries()` is the opposite mistake: it re-reads every query the
app has, the session included, to refresh one table.

An automation read fired with `useExecuteWorkflowNodeMutation` is not in the query cache at
all — there is no entry to invalidate, and refreshing it means calling it again.

Once the call settles, show what came back, never the value the handler expected: one handler
re-called `whoami` after advancing a stage, then set `stage: 'apply'` over the stage it returned.

The `object-data` skill has the helper to call and where it lives.

## Charts

Every chart gets a `<Tooltip>`. Any chart with **more than one series or slice** must let the
reader tell the categories apart — a `<Legend>`, or labels on the slices themselves. A pie
chart without either is a ring of colours nobody can read.

A single-series chart with a labelled axis needs neither; a legend there is noise.

## Headline numbers

A stat card, KPI tile, summary strip or legend range shows a figure at a glance, so it is
**compact**: "$14.2B", "1.2M", "38.4K" — never "$14,186,954,828.00". Every digit of a
ten-figure total is noise there, and a string that long overflows the card it sits in.
`useFormatters()` has `compact` for exactly this; money passes its currency code through,
and the exact value goes in a `title` so nothing is lost:

```tsx
import { useFormatters } from '@/lib/i18n'   // already in every app — nothing to install or read first
const fmt = useFormatters()
<strong title={fmt.currency(total, 'USD')}>{fmt.compact(total, { style: 'currency', currency: 'USD' })}</strong>
```

**Never build a displayed number by hand** — no `toFixed()` glued to a `$`, a `%`, a `B`, `M`
or `K`, anywhere a user reads it (cards, legends, tooltips, panels). It LOOKS compact and is
wrong in ways a glance misses: `` `$${(v / 1e9).toFixed(2)}B` `` prints "$0.00B" for a small
region and "$-2.30B" for a loss, never switches to M when a filter shrinks the total, and
ignores the user's locale. `fmt.compact` picks the unit, the sign and the separators. The
`title` carries the EXACT figure from `fmt.currency` / `fmt.number` — not the rounded string
repeated, which tells a hovering user nothing new. A percentage stored as 17.3 is
`fmt.number(17.3 / 100, { style: 'percent', maximumFractionDigits: 1 })` — the locale places
the sign and the spacing ("17,3 %" in French).

Counts under ten thousand stay exact (`fmt.number`) — "1,200 stores", not "1.2K stores".
Tables, detail panels and anything a user will copy keep full precision. If this app's
`useFormatters` has no `compact` (apps created before it was added), add it beside `number`:

```ts
compact: (value: number, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1, ...options }).format(value),
```

## Dropdowns

**A `Select` needs a source for its options** — values the schema declares
(`format: single-select`, `oneOf`, `enum`), a lookup onto another object's rows, or a list the
user gave you. Without one the field is free text; an invented set locks out the real value.

Choosing a value is **`Select`**. Firing an action is **`DropdownMenu`**. Never hand-roll
either from a button plus an absolutely-positioned div — `SelectContent` already renders in a
portal and scrolls itself, so it cannot be clipped by an `overflow-hidden` ancestor.

- In a form, give `SelectTrigger` `className="w-full"`. It is `w-fit` by default and will not
  line up with the `Input`s around it.
- Put **only a label** inside a `SelectItem`. It renders its own check indicator on the right
  and reserves the space for it, so an icon, checkbox or button added there sits misaligned
  and swallows the click.
- Never give a `SelectItem` `value=""` — Radix throws. For an "All" row use a sentinel such as
  `"all"`.

## Drawers and dialogs

Build one only where the plan calls for it; an inline or full-page view is usually better.

**A drawer that exists only on small screens is gated in JavaScript, never hidden with a
class.** "Persistent side panel on desktop, Sheet on mobile" is common, and
`<SheetContent className="lg:hidden">` looks like it does that. It does not: the class reaches
the panel only. The overlay is a sibling in the portal, and the modal behaviour — focus trap,
`pointer-events: none` on `<body>` — is JavaScript, so on desktop every selection opens an
invisible modal that **blurs and freezes the whole page** with nothing on screen to close it.
Decide in JavaScript whether the drawer exists at all, at the same breakpoint the panel appears:

```tsx
const isWide = useMediaQuery('(min-width: 1024px)')    // the `lg:` the desktop panel uses
<Sheet open={!isWide && open} onOpenChange={setOpen}>…</Sheet>
```

(The template's `SheetContent` now refuses to mount where its own classes would hide it, but
an app created before that carries the old copy — write the gate anyway.) The same holds for
a `Dialog` or `AlertDialog`: never hide one with a breakpoint class.

When you do build one:

**A dialog the user submits from owns its `open` state.** A `<Dialog>` given only a
`DialogTrigger` is uncontrolled: Radix keeps `open` to itself, and nothing in your submit
handler can close it. The X, Escape and a click outside all still work, so it looks
finished — the bug only appears after a real submit. The handler runs, the record is
created, the fields clear, and the dialog just sits there. The user reads that as a failure
and submits again.

Hold the state yourself, and close it only once the write has come back:

```tsx
const [open, setOpen] = useState(false)
const createIncident = useCreateIncident()

async function handleSubmit(event: React.FormEvent) {
  event.preventDefault()
  if (!validate()) return
  try {
    await createIncident(values)   // rejects on failure, so nothing below runs
    setOpen(false)                 // closing clears the fields — see onOpenChange
    toast.success('Incident raised')
  } catch {
    toast.error('Could not raise the incident — your details are still here.')
  }
}

<Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setValues(EMPTY) }}>
  <DialogTrigger asChild>
    <Button>Report an issue</Button>
  </DialogTrigger>
  …
```

- **Close on success only** — after the `await`. Never before it, and never in a `finally`.
  A failed save has to leave the dialog open with every value still in it and the error on
  screen; closing on failure throws away what the user typed and tells them it worked.
- **Never clear the fields before the write resolves.** Clear-then-fail is the worse of the
  two outcomes: an empty form, an open dialog, nothing saved, and nothing left to retry
  with.
- **Reset in `onOpenChange`**, not in the submit handler — one place then covers submit,
  Cancel, the X and Escape alike, so a re-open always starts clean.
- A dialog with **nothing to submit** — a detail view, a confirmation — can stay
  uncontrolled, and a plain Cancel button only needs `DialogClose asChild`.

`Sheet` and `AlertDialog` are the same Radix primitive and carry the same trap.

**`DialogContent`** is a grid carrying its own `p-4` and no maximum height, so a tall form
grows past the viewport: cap it (`max-h-[85vh]`) and scroll the body. Do not override its
padding — `DialogFooter` uses negative margins to bleed to the edges and will misalign.
