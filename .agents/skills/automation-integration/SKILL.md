---
name: automation-integration
description: How to connect a generated app to an existing UnifyApps automation (workflow) — find it, read its input/output schema, confirm an I/O mapping with the user, create the dataSource that authorizes the call (it writes the call's id and context into `src/data/callables.ts` — import it, never retype it), then write the executeWorkflowNode code. MANDATORY whenever the user asks the app to "call / run / trigger / use an automation" (or names one). Uses the find_automation / get_automation_schema / confirm_automation_mapping / create_datasource tools and the @unifyapps/app-builder-sdk/hooks/workflow runtime hooks. Backend objects/records are a SEPARATE concern — see the `backend-integration` skill. Also covers the outcome check every call needs: a failed automation comes back as HTTP 200 with its own failure in the body, so the wrapper must throw or the app reports success for work that never happened.
version: 18
---

# Automation integration — call an existing automation from the app

Load and follow this skill whenever the user wants the app to **use an existing
automation** ("run my `send invoice` automation", "call the pricing workflow when
they click Submit"). You do NOT build the automation — it already exists. Your job
is to wire the app to it: pick it, agree the input/output mapping, create the
dataSource that lets the app call it, then write the calling code.

## The flow — four tools, in order

**1. Find it (`find_automation`).** Pass the name (or id) the user gave. You get back
`{ matches: [{ id, name, callable, updatedTime }], count }`.
- **count 1** → use that `id`. If it's `callable: false`, tell the user it can't be run
  from an app and stop (don't create a dataSource for it).
- **count > 1** (several automations share the name) → **do NOT pick one yourself.** Show
  the user each match — **id + name + updatedTime + callable** — and ask **which id** they
  mean. Prefer `callable: true`; a non-callable one can't be connected.
- **count 0** → tell the user; never invent an id.

**2. Read its contract (`get_automation_schema`).** Pass the chosen `automation_ids`.
You get back `[{ id, name, description, inputSchema, outputSchema }]` (both JSON Schema).
`inputSchema` is what the automation needs; `outputSchema` is what it returns.

**3. Agree the mapping (`confirm_automation_mapping`).** Build a **best-guess** mapping
and show it — do NOT skip this and do NOT write code before it:
- **input_mapping** — one entry per `inputSchema` field: `constant` (fixed literal),
  `appData` (an app-state expression), or `arg` (a wrapper argument). Match by name/type;
  fall back to `arg`.
- **output_mapping** — the `outputSchema` fields the app uses (rename via `use_as`).
  Empty for a side-effect automation that declares nothing. If the schema declares an
  OUTCOME field (`success`, `status`, `error`), map it even for a side-effect automation:
  it is what tells the app whether the action actually worked — see "A failed automation
  still returns HTTP 200" below. If the schema declares what backs or qualifies a value —
  its sources (`sourceLinks`, `citations`), a supporting `quote`, a `confidence` or
  `warnings` — map those too and show them beside the value wherever it is shown or offered
  for approval: a value the user cannot check is taken on trust.
- **records_path** — where the useful data sits in the output (e.g. `["result","items"]`).
- **build_plan** — one sentence telling the user WHERE this lands in the app: the page, the
  trigger (a button or on-load), and the output (a table or cards of which fields). It shows
  in the confirm message so the user sees what they're approving — e.g. "A News page with a
  Refresh button and a card grid of each article's title, source, image and date."

Call it, then **stop and wait**. The confirmed mapping comes back as the next message.

**4. Create the dataSource (`create_datasource`).** AFTER the user confirms, call this with
the chosen `automation_id` and `input_fields` (the `inputSchema` field names the app will
set — the `arg`/`appData` inputs), and a short `name` ("Pricing") — it becomes the name of
the exported binding.
**Why this is required:** the platform's callables safety check refuses to run a normal
automation through execute-node unless a real dataSource backs the call — without it you
get HTTP 500 `forbidden datasource: not found`. The tool stores each `input_field` as a
`{{ }}` template so the app can override it at run time.

It also **writes the binding into `src/data/callables.ts`** — the dataSource id, the
automation id, and the `context` every call must carry — and returns
`{ dataSourceId, context, wrote, exportName }`. **Import that binding.** `context.appName`
and `context.resourceName` are fixed strings you cannot derive and will not be reminded of;
a call missing either is refused with `forbidden datasource : invalid input`, on a green
build and an app that looks finished. Only THEN write the code.

**If it fails, STOP — do not write the wrapper.** There is no placeholder that is better
than nothing here. A `DATA_SOURCE_ID` you made up (`'__DATA_SOURCE_ID__'`, `'TODO'`, an id
copied from these docs) compiles, builds green and passes review, and then sends that
literal string as the dataSource id on every call the running app makes — so the user sees
a finished-looking app whose every request 500s. Report the tool's error verbatim, say the
automation is not connected, and leave the app without the wrapper. A missing feature is
honest; a wired-looking dead one is not.

**No binding, no button.** Never stand one in with a `setTimeout` that toasts success — a
shipped "Run sweep" button did exactly that, and every click said "verified" while nothing ran.

## Writing the code — a `src/data/` wrapper

All automation calls live in **`src/data/`**. One wrapper per automation; components import
it, never the SDK hook directly. Import from **`@unifyapps/app-builder-sdk/hooks/workflow`**
(that exact subpath — vendored + aliased, no install).

The whole call — `id`, `context` and the `inputs` envelope — comes from the binding
`create_datasource` wrote into `src/data/callables.ts`, under the `exportName` it reported.
Import it. That is the path native interfaces use and the one the dataSource authorizes.

**Two rules, both measured against a live dataSource:**

1. **`context` and `storedInputs` go on the wire WHOLE.** Pass `B.context`, and spread
   `...B.storedInputs`. An `inputs` short of `version` / `runtimeConnections` /
   `synchronous` is refused with `forbidden datasource : invalid input` — the same error a
   broken context gives, naming no field either time. Measured: `{automationId, parameters}`
   alone is rejected; the full envelope returns 200.
   `runtimeConnections` stays `{}` in the code. The SDK fills it with each person's own accounts when the solution has Personal connectors; never write a map by hand.
2. **REPLACE `parameters` with real values.** The stored ones are `{{ }}` templates. A
   spread that leaves them is NOT refused — the automation RUNS, on the literal string
   `"{{title}}"`, and fails validation somewhere downstream where nothing points back here.
   A subset of `parameters` is fine: send only the fields you have.

```ts
inputs: {
  ...B.storedInputs,          // the envelope, whole
  parameters: { region },     // real values — REPLACES the {{ }} templates
}
```

Passing the caller's payload straight through as `inputs` is the mistake this prevents:
it drops the envelope entirely and every call 500s.

### Pick the hook by what the automation IS

| The automation… | Use | Why |
| --- | --- | --- |
| runs on a click / submit, or has side effects | `useExecuteWorkflowNodeMutation` | fires only when called; nothing cached or retried |
| should load on mount and only reads | `useExecuteWorkflowNode` | a query: auto-runs, caches by request, refetches |
| only reads, through a connector | `useExecuteWorkflowNode` | re-runs when the person's account changes |

**Never call the bare `executeWorkflowNode` function.** It carries no `x-ua-app` header and
a relative URL, so the backend rejects it — locally, in preview and deployed. Both hooks
above put the app's identity on the request for you; the bare function cannot.

If in doubt, use the mutation. A query behind a button is the common mistake: it fires as
soon as its inputs are non-empty rather than on the click, and caches the result so pressing
the button again does nothing. That means a button that STARTS work (Send, Generate,
Approve); a Refresh button or a filter on data the page loads keeps the query (see the
read-on-load example).

A read through a connector is the one exception: it is always a query, even when a click
starts it, because the maker can make any connector Personal at Publish and a mutation-backed
read keeps the old account's data after a connect, switch or remove. Put its inputs into state
on the click so the query runs then, and call `refetch` when the button is pressed again.
Writes such as Send or Approve stay on the mutation.

### A mutation (the usual case)

```ts
// src/data/pricing.ts
import { useCallback } from 'react'
import { useExecuteWorkflowNodeMutation } from '@unifyapps/app-builder-sdk/hooks/workflow'

// written by create_datasource — this automation's dataSource id, automation id and the
// context that authorizes the call. Without the context the backend rejects it.
import { PRICING } from '@/data/callables'

// this app's own global page — the page create_datasource anchored the dataSource to.
// Derive it, never hardcode: a literal slug names whichever app it was copied from.
const PAGE_SLUG = `global-page-of-${import.meta.env.VITE_APPLICATION_ID}`

// what THIS automation returns — copied from the `outputSchema` get_automation_schema gave you
type PricingResult = {
  success?: boolean
  message?: string
  items?: Array<{ list_price: number }>
}

// The one place this automation's outcome is decided. A refused call still comes back as a
// 200 — see "A failed automation still returns HTTP 200" below.
function unwrapPricing(envelope: unknown): PricingResult {
  const result = (envelope as { response?: PricingResult } | null)?.response ?? {}
  if (result.success === false) {
    throw new Error(result.message || 'The pricing automation could not complete.')
  }
  return result
}

export function usePricing() {
  const { mutateAsync, data, isPending, error, reset } = useExecuteWorkflowNodeMutation()

  // useCallback keeps `run` the same function on every render (mutateAsync never changes),
  // so a component can list it in a hook's deps without re-running the automation each render
  const run = useCallback(
    // `region` is an `arg` input — it overrides the {{region}} template on the dataSource
    async (region: string) => {
      const envelope = await mutateAsync({
        data: {
          context: PRICING.context,
          id: PRICING.id,
          inputs: {
            // the envelope, whole — automationId, version, runtimeConnections, synchronous
            ...PRICING.storedInputs,
            // REPLACES the stored {{ }} templates; leaving them runs the automation on them
            parameters: {
              __internals__: { m: 'BUILDER', s: PAGE_SLUG, c: 'PLATFORM', p: 'browser' },
              region,
              source: 'web', // a `constant` input
            },
          },
          options: {},
        },
      })
      return unwrapPricing(envelope)
    },
    [mutateAsync],
  )

  // the automation's output IS `data.response` — see "Reading the output" below
  const rows = ((data?.response as PricingResult | undefined)?.items ?? []).map((item) => ({
    price: item.list_price,
  }))

  // `run` rejects on BOTH failures — a call that never landed, and an automation that
  // landed and said no — so the component must catch it AND show the message. A silent
  // catch leaves the user staring at a button that looks dead; no catch at all reports
  // success for work that never happened.
  return { run, rows, isPending, error, reset }
}
```

### A read-on-load (only for automations that just fetch)

```ts
import { useExecuteWorkflowNode } from '@unifyapps/app-builder-sdk/hooks/workflow'
import { PRICE_LIST } from '@/data/callables'

// `region` is the screen's filter. A new value is a new request, so the query re-runs on its
// own and keeps each value's result; a Refresh button calls the `refetch` returned below.
export function usePriceList(region: string) {
  const { data, isLoading, error, refetch } = useExecuteWorkflowNode({
    context: PRICE_LIST.context,
    id: PRICE_LIST.id,
    inputs: { ...PRICE_LIST.storedInputs, parameters: { __internals__: {...}, region } },
    options: {},
  })

  // A query must not throw — that would take the page down mid-render — so the
  // automation's own failure is handed back beside `error` for the component to show.
  // Written out rather than imported from the SDK: the app's pinned SDK types are the
  // PUBLISHED ones, and a helper added to the runtime is not authorable until a release
  // carries its types. Four lines here always compile.
  const result = (data?.response ?? {}) as { success?: boolean; message?: string }
  const failure = result.success === false ? result.message : undefined

  return { rows: extract(data), isLoading, error, failure, refetch }
}
```

### Reading the output — it is `data.response`, nothing else

Both hooks resolve to the execute-node envelope. This is a REAL response, captured from a
running app:

```json
{
  "executionInstanceId": "6a662833b3a4c712782e39c9",
  "id": "e_6a661b4c17282b2fb934925d",
  "lookupReferences": {},
  "response": { "random_text": "randommmmmmm" }
}
```

So the automation's output is **`data.response`**, and its shape is exactly the
`outputSchema` that `get_automation_schema` returned. There is **no `body` key** — the
generated type says `response?: unknown` and nothing else. Read it directly:

```ts
const { random_text } = (data?.response ?? {}) as { random_text?: string }
```

**Do not write a deep search for your field.** Walking the object tree looking for a key by
name (`findKey(data, 'random_text')`, "try response.body then output then result") is a sign
the path is wrong, and it hides the real problem: it will silently pick up a same-named field
from somewhere else in the envelope, and it keeps working by luck rather than contract. You
already know the shape — you fetched it with `get_automation_schema`. Use it.

If a field is genuinely missing at `data.response`, the automation didn't return it. Say so
and check the automation, rather than searching for it elsewhere or falling back to a figure
the app works out from the form (`response.subtotal ?? form.qty * form.price`), which shows a
number the automation never gave.

### An action the brief restricts

The brief can name, for an action, the permission group and key that allow it and the
automation that runs it. Wire that action through the automation like any other call, and
show the control only to people who hold the key. Its binding in `callables.ts` carries the
key as `permission: { groupId, key }`, so the wrapper returns
`allowed: useCallableAllowed(B)` (from `@/lib/permissionKeys`) beside `run`, and the control
renders only when `allowed` is true — hidden, not disabled. The automation checks the key
again on the server, so a person whose
access changed since the page loaded still gets an answer: a refusal comes back as
`success: false` with a `message`, and the outcome check below already turns it into an
Error whose text is the automation's own. Show that text; it is the product's way of saying
no. The component that calls the automation calls `refetch()` from
`usePermissions(B.permission.groupId)` after a `success: false`:
if the person lost the key the control goes away, and if the failure was something else
nothing changes. One lookup either way. The record is written by the automation only
— the data bindings do not also write it.

### A failed automation still returns HTTP 200 — read the outcome, then throw

`mutateAsync` rejects when the CALL fails: network down, 4xx, 5xx. It does **not** reject
when the call worked and the automation reported that IT could not do the job. That comes
back as an ordinary 200 whose `response` carries the bad news. Captured from a Jira
connector that refused the ticket:

```json
{
  "executionInstanceId": "6ab82ebb011b875f7a27da6c",
  "id": "e_6ab29a262e7f36291e12aaa8",
  "lookupReferences": {},
  "response": { "success": false, "message": "Failed to create Jira issue", "data": {} }
}
```

`error` is `null` the whole time, the promise resolves, and the line after the `await`
runs. The app that shipped this said "Ticket created" every time Jira refused one. A wrong
success message is worse than a visible failure — the user walks away believing the work is
done and nobody goes back to check.

**The SDK already rejects on this exact shape.** `useExecuteWorkflowNodeMutation` throws when
`response` carries `success: false` with a message, so the mutation rejects instead of
resolving. Catch it as a plain `Error` — the SDK's own error class is not a name your app
can import until a release carries its types. Two things follow. The component's `try`/`catch` is
now load-bearing — without one a refused call is an unhandled rejection rather than a false
success. And the message the user sees is the automation's own, but only if the `catch`
binds it: a bare `catch {}` with a fixed sentence throws it away.

**Your wrapper still decides for THIS automation.** The SDK matches one convention; the
`outputSchema` is the contract. An automation that reports failure another way —
`status: 'FAILED'`, an `error` object, a required field left empty — is invisible to the SDK,
and only the wrapper can catch it.

**Decide the outcome in the wrapper, once, and throw.** You already know what to look at:
`get_automation_schema` gave you the `outputSchema`, and whatever this automation calls its
outcome — `success`, `status`, `error`, `errorMessage` — is a declared field like any other.

**`{ success, message, data }` is the shape to expect.** Automations generated with a
solution almost all declare exactly that — 7 of the 8 on the Jira portal this rule came
from, the 8th declaring no output at all. `success` says whether it worked, `message` is a
sentence for a person, `data` is the payload and is `{}` on failure. Read the schema anyway;
just don't be surprised when it is this.

```ts
if (result.success === false) {
  throw new Error(result.message || 'The pricing automation could not complete.')
}
```

Three things about that one line:

- **Test for the failing value, not for truthiness.** `if (!result.success)` also throws for
  an automation whose output has no `success` field at all — a data-only automation would
  then fail on every successful call.
- **Only when the schema declares one.** An automation with no outcome field tells you
  nothing about whether it worked. Invent nothing; "it returned" is all you know.
- **Carry the automation's own `message`.** It is written for a person and names the real
  problem ("Failed to create Jira issue" says go look at the connector). A generic
  "Something went wrong" throws that away.

The payoff is that the component needs no special case — `await` finally means what every
worked example already assumes it means:

```tsx
try {
  const result = await createTicket(values)
  toast.success(result.message || 'Ticket created')
} catch (failure) {
  // failureMessage() (next rule) shows the automation's own words here, and keeps a failed
  // CALL's raw "[UAFetchError] … : [id]" log line out of the toast.
  toast.error(failureMessage(failure, 'Could not create the ticket'))
}
```

**The success text says what `response` says, nothing more** — its `message`, or a field it
returned. Never a count from the brief or the plan: an app toasted "Scheduled 14,400
attestations" from its plan while the automation had answered `attestations_created: 0`.

**A query is the same rule with a different exit.** `useExecuteWorkflowNode` runs during
render, so a wrapper that throws takes the page down instead of the request. Return the
failure beside `error` and let the component render whichever is set — the read-on-load
example above does this.

And never announce before the call settles: calling the wrapper without `await`, then firing
`toast.success(...)` on the next line, reports the outcome while the request is still in
flight — right by luck, wrong every time the automation says no.

### A failed CALL rejects with a raw message — show the reason, not `.message`

The section above is the call that LANDED. This is the other branch of the same `catch`: the
call that never landed — network down, 4xx, 5xx. `mutateAsync` rejects, and what it rejects
with is the network layer's error, whose `.message` is a log line built for whoever debugs the
platform, not for the person using the app:

```
[UAFetchError] Workflow execution failed https://…/api/workflow/execute/node : [a8f7c-…]
```

Put that in a toast and the user is shown an internal URL and a request id for an action that —
because a workflow can write its record and then fail on a later step — may well have saved.
They report a bug, or retry a sign-off that already went through. This is the failure the rule
exists to stop.

**The readable reason is on `.payload`, never `.message`.** The network error carries the
backend's own sentence at `payload.message` and the id at `payload.errorId`. Show the sentence;
keep the raw `.message`, the URL and the id for `console.error` or a "details" expander only.

**One extractor, because one `catch` sees both endings.** The success:false case above was
rethrown as a plain `Error` whose `.message` is already the automation's own words; a failed
call rejects with the network error whose words are on `.payload`. Tell them apart by which one
carries a payload:

```ts
// A failed CALL rejects with the network layer's error (it has a `.payload`); its `.message`
// is the raw "[UAFetchError] … : [id]" log line, so read the human sentence off `.payload`.
// A success:false was rethrown as a plain Error (no payload) whose `.message` is clean.
function failureMessage(failure: unknown, fallback: string): string {
  const payload = (failure as { payload?: { message?: string; errorMessage?: string } }).payload
  if (payload) {
    return payload.message || payload.errorMessage || fallback
  }
  if (failure instanceof Error) {
    return failure.message
  }
  return fallback
}
```

**Make the fallback a sentence about THIS action**, not a generic one. "Sign-off could not be
saved. Try again." tells the user what to do; "Please verify network and backend status" is the
same empty string on every failure and names nothing.

**A rejection is not proof the write failed.** A workflow can store its main record and then
fail on a later step (an audit-log write, a notification), so the call rejects 5xx although the
change is saved. When the toast would tell the user their work was lost, don't trust the
rejection alone — re-read the record that feeds the screen (invalidate or refetch its query) and
report failure only if it did not change. "Failed" on a saved sign-off is what makes the user
sign off a second time.

### Never fetch inside `useEffect`

`project-guidelines.md` says data comes through hooks, never a fetch inside `useEffect` —
and that applies here with no exception. An automation that should run on page load is a
**query**: use `useExecuteWorkflowNode`, which runs on mount by design.

Reaching for `useEffect` + the mutation means you picked the wrong hook. There is no
"external-system boundary" carve-out for automations; the query hook IS the sanctioned
on-load path.

Do **not** pass a `meta` of your own to either hook. The app's identity already rides in the
default meta, and supplying your own on a query REPLACES it (React Query shallow-merges
default options), which drops the `x-ua-app` header and fails the call.

## Connector accounts

If a read fails and `classifyRuntimeConnectionFailure(error)` (from `@unifyapps/app-builder-sdk`) returns an object whose `kind` is `connection_required` or `connection_expired` (`const failure = classifyRuntimeConnectionFailure(error); failure?.kind === 'connection_required'`), show a short "connect your account" state with a button that calls `openGate` from `useRuntimeConnections`. The SDK opens its modal only on first visit and after a refused write, so after "Not now" a read has no other way back. Use it only for these two connection failures; every other failure keeps its normal error state.

When the app calls an automation that uses any connector, give the person one "Manage connections" control: a button, a menu item or a sidebar link, wherever it fits, drawn in the app's own style. It calls `openManageConnections()` from `useRuntimeConnections`, which opens the SDK's own dialog to switch accounts, add one, disconnect and reconnect.

- Render the control only when `hasPersonalConnectors` is true. When no connector is Personal, nothing renders, including the button, menu item or sidebar link.
- Never build an accounts dialog, an account list, a switch, a disconnect or a sign-in UI. The build refuses a component that lists accounts or calls `switchAccount`, `removeAccount` or `connect` itself.
- Never hand-build a `runtimeConnections` map, and never gate a call on a personal account.
- The app never asks for accounts on page load. The SDK opens its connect modal by itself.
- Never write a connector's name, id or mode into the app. The maker can switch a connector between Enterprise and Personal at Publish without rebuilding the app.
- A read through a connector is always a query; see "Pick the hook by what the automation IS".

```tsx
const { hasPersonalConnectors, openManageConnections } = useRuntimeConnections()
if (!hasPersonalConnectors) return null
return <Button onClick={() => void openManageConnections()}>Manage connections</Button>
```

## Building the `parameters` from the mapping

- `constant` → hard-code the value in `parameters`.
- `appData` → reference the confirmed app expression.
- `arg` → a wrapper-function argument the component passes; it overrides the matching
  `{{ }}` template that `create_datasource` stored on the dataSource.
- A file input (it declares `source`/`sourceType`, or is a `file-uploader` or file object)
  → pass `toFileUploaderValue(uploaded, accessScope)` from the `file-upload` skill, never an
  object built from the upload's fields. File steps read only `source` + `sourceType`;
  without them the run fails with `File source is required`.

**Send each value in its declared type — never `String()` a number.** `inputSchema` says
what each field is; send that JS type — a `number`/`integer` field gets a number, a
`boolean` a boolean, a date in the format the schema declares. The one misleading signal is
that the stored templates in `callables.ts` are strings (`"{{quantity}}"`) — that is the
TEMPLATE, not the field's type. A stringified number (`quantity: String(qty)`) reaches a
`number` field and the run fails to cast it: `Cannot cast '112' with class java.lang.String
to class java.lang.Number` — a 500 that still typechecks and builds green, because the wire
type is `unknown`. Type the `parameters` object with the generated `<Name>Input` from
`automationTypes.ts` and pass values straight through, so a stringified number is a compile
error instead of a runtime one. A number input that accepts decimals (money, rates) also
needs `step="any"` on the field — the HTML default `step="1"` rejects `537.44` before submit.

Keep `automationId`, `id` (dataSourceId), and `resourceVersion` exactly as returned — they
are the invocation contract. Always include `parameters.__internals__` for callables.

## Never use `useTriggerWorkflow`

`useTriggerWorkflow` (`/api/workflow/trigger`) is **deprecated** and bypasses the callables
governance layer — **do NOT use it, ever.** Every automation call goes through
`create_datasource` + `executeWorkflowNode` (above). If `create_datasource` fails, surface the
error and stop — do not fall back to trigger.

## Caveats (real, do not skip)

- **Create the dataSource once per automation** and reuse its binding — don't mint a new one
  per render. The `create_datasource` step is mandatory for the execute-node path; calling it
  twice for the same automation rewrites that automation's block rather than adding one.
- **`forbidden datasource : invalid input` means the call's SHAPE was refused**, not that
  anything is missing from the platform. Two causes, both measured: a `context` short of
  `appName` / `resourceName` / `resourceVersion`, or an `inputs` short of `version` /
  `runtimeConnections` / `synchronous`. The error names neither, so it reads like a platform
  problem. Pass `<BINDING>.context` and spread `<BINDING>.storedInputs` and it cannot happen.
- **Result availability depends on the automation.** A synchronous automation (with a
  response/return node) returns its output at `data.response`; one without returns nothing
  useful — treat it as side-effect only.
- **Never hardcode secrets or tenant ids** in the wrapper — the session cookie authenticates
  the call and the SDK's default meta scopes it to this app.
- **Never hand-add the `x-ua-app` header.** The hooks put it there from the app's build-time
  id; a hand-written one goes stale the moment the app id changes.
- **Show failures — both kinds, readably.** For a call that landed and said no, show its own
  message; for a call that never landed, show `failureMessage(error, …)` — its `.payload`
  reason — never the raw `error.message`. A failed call with no visible error is
  indistinguishable from a dead button; one shown as a SUCCESS is worse than both; and one shown
  as the raw `[UAFetchError] … : [id]` log line sends the user to report — or retry — work that
  may already have saved.
