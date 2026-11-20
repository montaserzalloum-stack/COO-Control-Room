---
name: analytics
description: Record custom analytics events from the app with the SDK's useCustomEvent hook, so they show up in the app's Insights → Events tab. Load whenever the user asks to track / measure / instrument something, wants analytics or usage data, asks "how many people clicked X", or asks where their events went. Also covers manage_custom_events, the tool that syncs the app's event list onto its record — REQUIRED on any turn that adds, renames or deletes an event. Not about building a charts SCREEN inside the app (that is ordinary app data).
version: 4
---

# Analytics — custom events

The platform records what happens in the app and shows it on the app's **Insights** tab
(Overview → Insights, next to Versions and Settings). Three modules live there:
**Engagement**, **Performance** and **Events**. The first two fill themselves — sessions,
page views, load timings, all collected for you with nothing to write.

**Events is the one you fill.** A custom event is a line of code that says "this
happened": an order placed, a filter applied, an export downloaded. This skill is how you
write them.

## Which request is this?

| The user means | What to do |
|---|---|
| "Track when someone submits", "I want to know how many people use X", "add analytics" | `useCustomEvent` — this skill |
| A **dashboard / charts page INSIDE the app** ("show me a revenue chart") | Ordinary app data — a page + recharts + their records. Not this skill |
| "Where are my analytics?" / "the events tab is empty" | This skill — go to [Why nothing is showing up](#why-nothing-is-showing-up) |

## The hook

```tsx
import { useCustomEvent } from '@unifyapps/app-builder-sdk';

function CheckoutButton() {
  const sendCustomEvent = useCustomEvent();

  return (
    <Button
      onClick={async () => {
        await placeOrder();
        sendCustomEvent('checkout_completed', { plan: 'pro', items: 3 });
      }}
    >
      Place order
    </Button>
  );
}
```

That is the entire API: `sendCustomEvent(eventName, attributes?)`.

**There is no setup.** No provider to add, no key to configure, no event to declare
anywhere first. `AppBuilderProvider` — already in `main.tsx` — mounts the analytics
client, and the dashboard builds its event list out of the rows that arrive. An event
name you have never sent simply has no row yet.

**It never throws and never needs a guard.** Do not wrap the call in `try/catch`, do not
`await` it (it returns `void`), and do not branch on whether analytics is switched on.
When collection is off there is no analytics client at all and the call does nothing.

## Naming the event — the part that matters

The dashboard groups rows **by the event name string**. The name is the entire dimension;
everything else is decoration. Two consequences, and both bite later rather than now:

- **Pick a name once and never change it.** A rename does not move history — it starts a
  second row that nothing joins back to the first, and the user sees their numbers halve.
- **Never put a variable in the name.** `` sendCustomEvent(`order_${orderId}`) `` produces
  one row per order and a dashboard with ten thousand rows of `1`. The varying part goes
  in `attributes`; the name stays constant.

Use `snake_case`, `object_verb`, past tense — `order_placed`, `filter_applied`,
`report_exported`, `invite_sent`. Consistency across the app matters more than the exact
convention: `order_placed` next to `UserSignedUp` next to `export-report` reads as three
people's work in one table.

## Attributes

`attributes` is an optional flat object of JSON values. It is stored on the event row.

**It is not charted today** — the Events module reads the name, the count, the user and
the timestamp. So anything the user wants to *see* has to be in the name: if they want
exports split by format, `report_exported` with `{format: 'pdf'}` shows them one number,
while `report_exported_pdf` / `report_exported_csv` shows them two. Ask which they want
rather than assuming; the first is better data and the second is what they can read this
week.

**Never pass identity.** No user id, no email, no session id, no name. Every row already
carries the user and the session, attributed server-side from the request — passing them
again duplicates a column that is already there, in a field nobody queries, and puts
personal data somewhere it does not belong. The same goes for anything secret: tokens,
passwords, full record payloads.

Keep them small and flat — a handful of short scalars. Not the whole form state, not an
array of records.

## Where to call it

**On the thing that happened**, in the handler, right after it succeeds:

```tsx
const ok = await saveInvoice(values);
if (ok) sendCustomEvent('invoice_saved');
```

Not in `useEffect`, not in render, not on mount. An effect fires again on every re-render
whose deps moved and on every remount — the numbers come out inflated by an amount nobody
can work out afterwards. The one legitimate effect is a deliberate "this screen was
reached" event with an empty dep array, and even that is usually already covered: page
views are collected for you.

Do not instrument the failure path with the success name. If the user wants failures
tracked, that is its own event (`invoice_save_failed`).

## How many events

**Instrument what the user asked for, and stop.** If they named one thing, send one
event. If they said "add analytics" with no specifics, cover the app's few genuine
outcomes — the actions the app exists to produce — and say which ones you picked. Five
meaningful events beat forty; an event on every button produces a table nobody reads and
still misses the question they actually had.

## Declaring the events — grep, then sync

The app's interface record carries a `customEvents` list that the platform reads. It
must match what the code actually sends, so you do not declare events from memory —
**you read them out of the app and sync the whole set**, with `manage_custom_events`.

Do this on any turn where you add, rename or delete an event.

### Step 1 — find the call sites

Grep for the HOOK, not the call. `useCustomEvent()` returns a function the app names
itself, so `sendCustomEvent(` is not guaranteed to be the spelling in every file:

```
grep -rln "useCustomEvent" app/src
```

That is usually two to five files. Read them, and from each collect: the name the hook
is bound to, every call on it, and the object literal passed as the second argument.

### Step 2 — sync the complete set

```
manage_custom_events(events=[
  {event_name: "order_placed", attributes: {plan: "string", items: "integer"}},
  {event_name: "invite_sent"},
])
```

`operation` defaults to `replace`: the record becomes **exactly** this list. Names you
omit are undeclared, which is what makes a deleted call site and a renamed event
reconcile on their own — there is nothing to remember. So the list must be everything
the app sends, which is why it comes from the grep rather than from what you changed
this turn.

**Include call sites you did not write.** A code app is a git repo and a person can
push a `sendCustomEvent(...)` you never saw. The record describes the app, not your
contribution to it, so those events are declared like any other — and the grep finds
them without you having to think about it.

`add` (declare without dropping anything), `remove` (undeclare by name) and `list`
(read) exist for narrower jobs, but `replace` after a grep is the normal flow.

### Declaring is not sending

Both halves are needed and neither substitutes for the other:

| | what it does | what happens if you skip it |
|---|---|---|
| `sendCustomEvent(...)` in the app's code | emits the event | **no data, ever.** Insights → Events stays empty and nothing indicates why |
| `manage_custom_events` | syncs the record | the event still fires and still charts, but the platform's list of the app's events is wrong |

The failure to watch for is doing the second INSTEAD of the first. A declared event that
nothing sends produces no rows at all, and the turn looks successful right up until
somebody opens the tab. **Write the calls first, then grep, then sync.**

### Three things the tool does not do

- `attributes` documents what the code passes. It does not validate, filter or change
  it — take the keys from the call you just read, and omit the field for an event sent
  without attributes.
- Undeclaring deletes no collected data. Rows already recorded under a dropped name
  still chart; the record just stops advertising it.
- It cannot see a name that is not a literal. `` sendCustomEvent(`order_${id}`) `` is
  undeclarable AND unusable — it makes one dashboard row per order. If the grep turns
  one up, **fix the call**; do not invent a declaration for it.

Never pass an empty list to `replace` unless the grep genuinely found no call sites —
it clears the declaration.

On a brand-new app the interface record does not exist until the first publish. The tool
says so and succeeds anyway — that is not a failure and not worth retrying, and the
events themselves are unaffected.

## Why nothing is showing up

Collection runs on a **deployed, private** app with analytics enabled. Analytics is on
from the moment a code app is created, so the usual answer is one of the first two:

| Symptom | Cause |
|---|---|
| Nothing in Events while testing in the builder | **Preview never collects.** The app must be published and opened as the deployed app |
| Nothing from a public app | A public app is sessionless, so there is no user to attribute a row to. Collection is off there by design |
| Nothing at all, ever | Analytics was turned off for this app (`integrations.appAnalytics.enabled` on its record) |
| Events arrive but a name is missing | That name has never been sent — the list is built from the data |

When you finish adding events, **say this in your reply**: which events you added, where
they fire, and that they appear on the **Insights → Events** tab *after publishing* —
preview will look empty and the user will otherwise read that as a bug in your work.
