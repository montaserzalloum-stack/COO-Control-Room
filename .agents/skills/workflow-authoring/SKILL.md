---
name: workflow-authoring
description: Write a UnifyApps automation as a TypeScript program against the wfc builder API, compile it, and publish it for its automationId. Covers the DSL, the condition IR, finding actions in the 14,433-action catalog, and the traps that break a workflow at run time.
version: 9
---

# Authoring a UnifyApps automation

You write ONE file — `workflow.ts` — against the `wfc` builder API. The compiler emits the
workflow JSON. **Never write workflow JSON by hand.** A node's `groupId` encodes its whole
nesting path (`c₁@…@c_k@root_id-1@t₁@…@t_k`, containers innermost-first, tokens outermost-first)
and must agree with the typed edges and with `{{ }}` reference scoping. Nesting blocks in the
program produces all three correctly; hand-authoring them does not.

## The loop

1. **Find the action.** 14,433 actions across 1,073 apps — you cannot know their names.
   `find_action("send a slack message")`, or with `app: "salesforce"`, or `triggers: true`.
2. **Inspect every storage object you touch**: `describe_object("users")` reports the real field
   names from live records, plus the record shape. Field names are NOT in the action catalog and
   cannot be guessed — and a wrong one returns an EMPTY result rather than an error.

   ```
   RECORD SHAPE: {"id": "...", "properties": { ...fields... }}
     in a loop body read  item.properties.userId      (NOT item.userId)
     in a filter use      eq('properties_userId', …)  — the same field, flat-path spelling
   ```
3. **Read the action's contract** before filling a payload: `describe_action(app, action)`. `*` marks
   required; **OUTPUTS** is what later nodes may reference; **LIVE LOOKUPS** names fields whose
   values come from the tenant — an object type, an entity field, a connection — which you must
   ask for, never invent.
4. **Write `workflow.ts`**, then `build`. Fix every error *and* every warning.
5. **`publish_automation`** — creates, deploys, and returns the **automationId**. That id is the
   deliverable; report it to the user.

## The API — one function

```ts
import { workflow, schema, and, or, eq, neq, gt, lt, contains, exists, missing, isTrue, maybe } from './wfc';

const wf = workflow('Human Readable Name');

// START. `setup` is a SCHEMA, not a value — it is the input signature the caller sends.
const t = wf.createNode({
  app: 'callables', action: 'callables_from_automation', type: 'START',
  title: 'Trigger via automation', subTitle: 'Callable',
  trigger: { type: 'CALLABLE' },
  payload: { setup: schema({ orderId: 'string', amount: 'number' }) },
});
//   t.out.orderId  ->  {{ <startId>.outputs.orderId }}   — you never see or write a node id

// Any catalog action, found with find_action and read with describe_action.
const rec = wf.createNode({
  app: 'storage_by_unifyapps', action: 'storage_by_unifyapps_fetch_records',
  title: 'Fetch the order',
  payload: {
    object_type: 'orders',                    // from a lookup or the user — never invented
    numberOfRecordsToFetch: 'SINGLE',
    triggerInputCondition: and(eq('properties_orderId', t.out.orderId)),
  },
});
//   rec.out.objects[0].properties.status     — dot and bracket access both work
//   rec.out.any('body.deep.field')           — the escape when a shape is not knowable

// Inline logic is an action too. `output` makes calc.out.result.<field> referenceable;
// `input` is DERIVED from `parameters` — never write it.
const calc = wf.createNode({
  app: 'code_by_unifyapps', action: 'code_by_unifyapps_groovy',
  title: 'Check the amount', subTitle: 'Code By UnifyApps',
  paramTypes: { amount: 'number' },          // a handle carries no build-time type; declare it
  payload: {
    captureStdOutput: false, compile_static: false, isAsync: false,
    parameters: { amount: t.out.amount },
    output: schema({ big: 'boolean' }),
    code: "def a = binding.hasVariable('amount') ? amount : 0\nreturn [big: (a as BigDecimal) >= 1000]",
  },
});

// Nesting is the `blocks` field, keyed by BRANCH TOKEN. The block receives the container's own
// handle, so a loop body reads `self.out.item`.
wf.createNode({
  app: 'if_else', action: 'if_else_condition', type: 'IF_ELSE',
  title: 'Big order?', subTitle: 'Condition',
  payload: and(isTrue(calc.out.result.big)),
  blocks: {
    y: () => { /* true arm */ },
    n: () => { /* false arm; omit it and the false path just falls through */ },
  },
});

wf.createNode({
  app: 'loop', action: 'loop_for_each', type: 'LOOP',
  title: 'For each record', subTitle: 'Loop',
  payload: { listSource: rec.out.objects, captureIterations: false, repeatMode: 'SINGLE' },
  blocks: { l: (self) => { /* self.out.item.properties.x */ } },
});

// STOP. Every path must respond. `result` here IS the response payload.
wf.createNode({
  app: 'callables', action: 'callables_return_to_automation', type: 'STOP',
  title: 'Respond to automation', subTitle: 'Callable',
  payload: { result: { decision: 'OK' } },
});

export default wf;
```

Conditions are one shape shared by `if_else`, branch conditions, while-loops and storage filters:
`and(...)` / `or(...)` over `eq · neq · gt · lt · contains · exists · missing · isTrue`.

### Branch tokens

| token | meaning | edge emitted |
|---|---|---|
| `y` / `n` | IF_ELSE true / false arm | `if` / `next` |
| `l` | LOOP body — its tail edges BACK to the loop | `loop` |
| `1`..`N`, `default` | BRANCH cases | `branch` |
| `error` | the error arm | `error` |

## createNode is the only method

`wf.createNode` builds every node. There is no `wf.groovy`, no `wf.trigger`, no `wf.respond`, no
`wf.ifElse` and no `wf.forEach` — one function to learn, and one code path in the compiler.

What used to need a method is handled as data:

| | how |
|---|---|
| a Groovy node's `inputs.input` | **derived** from `inputs.parameters` — it is the schema OF those keys. Hand-writing both is what production gets wrong: they disagree in 249 of 7,499 corpus nodes. Pass `input` yourself to override. |
| any other schema-shaped key (`output`, `setup`) | `schema({ a: 'string' })` |
| "exactly one trigger" | checked on `type: 'START'` |
| containment | the `blocks` field, keyed by the tokens above |

## Schemas the builder will actually render

An automation can save, deploy and RUN perfectly while being **uneditable** — the run path
accepts schemas the design-time form refuses. Every rule below was learned from a builder that
would not open a node the runtime was happy with, so "it runs" is not evidence the UI can show
it. The compiler emits all of this for you; the list is here so you recognise it in a node you
are repairing by hand.

| rule | what goes wrong without it |
|---|---|
| every property carries a `type` | the form does not render at all (all 18,503 corpus groovy input properties have one) |
| an `array` carries `items` | *"Unsupported field schema, reason = Missing items definition"* |
| an array of records uses `items: {additionalProperties:false, properties:{}, type:'object'}` | a bare `{type:'object'}` satisfies "items present" but still will not render — the corpus uses the full shape 1,774 times against 132 |
| an **array-bound parameter is a `mappedArray`**, not a pill | the field renders as an empty list mapper — the value is invisible and cannot be edited |
| `context.type: "APPLICATION"` + a `resourceVersion` | 7,991 / 7,907 of 7,997 corpus groovy nodes carry them |

**Your `build` enforces all five.** It refuses a definition the builder could not render, with
the offending path named — so you find these at build time, not when someone opens the
automation. If you are repairing a node by hand, the same rules apply.

### mappedArray — the one you will hit by hand

A groovy parameter typed `array` and bound to a whole list is NOT a plain `{{ }}` string. The
corpus carries **3,854** of these against **23** plain pills:

```json
"parameters": {
  "records": {
    "source":  "{{ n2oeos.outputs.objects }}",
    "items":   "{{ n2oeos.outputs.objects[0] }}",
    "ua:type": "mappedArray"
  }
}
```

`source` is the list; `items` is the template each element is mapped through — for a
pass-through, the same reference indexed `[0]`. A scalar parameter stays a plain pill. The
compiler decides this from the parameter's resolved type, so declare `paramTypes` when it
matters and the right shape follows.

## The rules that actually bite

- **Never use a native `if` / `for` / `while` / `&&` / ternary on a handle.** A handle is a
  build-time reference with no value — `if (x.out.flag)` is always true. Use `wf.ifElse` /
  `wf.forEach`. The compiler rejects it, but know why.
- **An `array` property must declare `items`** or the builder refuses the form with
  "Unsupported field schema, reason = Missing items definition". The compiler fills in
  `{additionalProperties:false, properties:{}, type:'object'}` — the shape the corpus uses for a
  list of records, 1,774 times against 132 bare `{type:'object'}`. For a list of scalars say so:
  `schema({ ids: { type: 'array', items: { type: 'string' } } })`.
- **A handle carries no type of its own**, so the compiler resolves one — from the referenced
  node's schema, or from the known shape of a built-in's output. It can never know a LIST's
  ELEMENT type, so a loop item falls back to `object`. When you know better, say so:
  `paramTypes: { uid: 'string' }`. Every groovy input property must carry a type (all 18,503 in
  the corpus do) and a wrong or missing one renders wrong in the builder UI.
- **A Groovy param that resolves to null is NOT BOUND AT ALL.** The null check is
  `binding.hasVariable('x')`, never `x != null`. Always destructure with a default.
- **Booleans arrive as strings.** Conditions compare string-coerced values, so `isTrue(x)` is
  the idiom for a boolean result.
- **`maybe(handle)`** when you read a node that may not have run on this path — e.g. one inside
  a different branch. It marks the read optional and silences the warning. Without it the
  compiler warns that the reference will bind to null, which is usually a real bug.
- **A respond node's `result` must be an OBJECT, never an array.** The platform refuses a run
  with `'result' field must be a Map but got: JSONArray`, and only at RUN time — it compiles and
  publishes happily. Returning a list means wrapping it: `payload: { result: { objects: x.out.objects } }`.
- **Respond on every path.** An `ifElse` with a `respond` in only one arm leaves the other open.
- **Never invent an `object_type`, a field name, or a `connectionId`.** `describe_object` answers the first two; ask the user for the third.
- **The platform validates your Groovy at DEPLOY time, not at build time.** It blacklists some
  identifiers outright — assigning to `owner` is refused as "Blacklisted commands found in code"
  because it is a Closure property. Rename the variable; the compiler cannot warn you.
- **Saving is not deploying.** `publish_automation` does both; that is why you use it rather
  than any other route.

## Worked example

```ts
const wf = workflow('Order Triage');

const t = wf.createNode({
  app: 'callables', action: 'callables_from_automation', type: 'START',
  title: 'Trigger via automation', subTitle: 'Callable',
  trigger: { type: 'CALLABLE' },
  payload: { setup: schema({ orderId: 'string', amount: 'number', region: 'string' }) },
});

const score = wf.createNode({
  app: 'code_by_unifyapps', action: 'code_by_unifyapps_groovy',
  title: 'Score the order', subTitle: 'Code By UnifyApps',
  paramTypes: { amount: 'number' },
  payload: {
    captureStdOutput: false, compile_static: false, isAsync: false,
    parameters: { amount: t.out.amount, region: t.out.region },
    output: schema({ needsReview: 'boolean', tier: 'string' }),
    code: [
      "def amt = (binding.hasVariable('amount') ? amount : 0) as BigDecimal",
      "def reg = binding.hasVariable('region') ? region : 'UNKNOWN'",
      "def tier = amt >= 10000 ? 'ENTERPRISE' : (amt >= 1000 ? 'MID' : 'SMB')",
      "return [needsReview: (amt >= 10000 || reg == 'RESTRICTED'), tier: tier]",
    ].join('\n'),
  },
});

const respond = (result: Record<string, unknown>) =>
  wf.createNode({
    app: 'callables', action: 'callables_return_to_automation', type: 'STOP',
    title: 'Respond to automation', subTitle: 'Callable',
    payload: { result },
  });

wf.createNode({
  app: 'if_else', action: 'if_else_condition', type: 'IF_ELSE',
  title: 'Needs review?', subTitle: 'Condition',
  payload: and(isTrue(score.out.result.needsReview)),
  blocks: {
    y: () => respond({ decision: 'REVIEW', tier: score.out.result.tier }),
    n: () => respond({ decision: 'AUTO_APPROVE', tier: score.out.result.tier }),
  },
});

export default wf;
```

A local `respond` helper like that one is fine and encouraged — it is a function in YOUR file,
not a second API. Verified end to end on qa: `25000/EU` -> `REVIEW/ENTERPRISE`,
`250/EU` -> `AUTO_APPROVE/SMB`, `50/RESTRICTED` -> `REVIEW/SMB`.
