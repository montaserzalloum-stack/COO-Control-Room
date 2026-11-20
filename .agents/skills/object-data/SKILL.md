---
name: object-data
description: How a generated app reads and writes its backend records at RUN TIME — reads through the shipped `useData`, writes through the shipped `useCreateRecord` / `useUpdateRecord` / `useDeleteRecord` hooks (which own the response envelope, so a create hands back the new record's real id at `response`, and the cache refresh). Covers the five object-agnostic dataSource bindings, the exact filter structure, pagination, and the response envelope. BACKEND APPS ONLY — load it before writing any data-access code when the plan says PERSISTENCE: backend, or when adding a backend to an app that was UI-only. A local/UI-only app has no bindings and must never provision them. The app must never call the platform entity API; those are build-time tools. Provisioning the objects themselves (create_object / create_records), and building on an object the USER already owns (read_object — never create a second one), are covered by `backend-integration`.
version: 17
---

# Object data at run time — the five bindings

**Only for an app that persists to the BACKEND.** If the plan says `PERSISTENCE: local`
— a UI-only app — none of this applies: keep using the local store, and do NOT call
`provision_data_sources`. Provisioning mints five platform entities; doing it for an app
that never reads them leaves five orphans nobody can attribute. The moment a UI-only app
gains a backend, provision then and come back here.

Everything below is **verified against a live environment**, including the failures.
Where a shape is wrong in a way that still parses, the backend returns **200 and
ignores it** — there is no error to read, so these shapes are not negotiable.

The app never calls the platform entity API (`/api/entity`, `/api/aggregation`, or the
`hooks/object` hooks). Those are the agent's build-time tools, authorized as the person
running the build; a deployed app calling them is unauthorized.

## The tool — `provision_data_sources`

One call, no arguments. It:

1. mints the five `e_data_source` entities for THIS app, anchored to the app's own
   global page (so they still resolve once the app is deployed);
2. writes them into **`src/data/bindings.ts`** — ids, `context`, the full
   `storedInputs` and the `overridable` list, plus the helpers below;
3. returns the same thing in its result, so you can report what happened.

**When to call it**

- ONCE per app, on the FIRST backend build, before you write any data-access code.
- Again only when an app that was UI-only gains a backend — that is a first backend
  build too.

**When NOT to call it**

- `PERSISTENCE: local` / a UI-only app. Ever.
- A second time on an app that already has bindings: the five are object-agnostic and
  already cover every object. Adding an object needs `create_object` + an `ENTITY`
  entry, NOT another binding. An object the USER provided needs no `create_object` at
  all — `read_object` it, add its entityType to `ENTITY` verbatim, and the same five
  bindings read and write it alongside the ones you minted.
- To "fix" a failing call. A 500 here is almost never a missing binding — read
  "Two rules" below first, then the filter section.

If it reports errors, relay them and do NOT write the calling code: an invented or
copied id builds green and fails every request at run time.

## The bindings

`provision_data_sources` mints five and writes them into **`src/data/bindings.ts`** with
this app's real ids. You never write that file and never type an id into it.

| export | action | overridable inputs |
| --- | --- | --- |
| `FETCH` | fetch records (MULTIPLE) | `object_type`, `triggerInputCondition`, `page`, `sortBy`, `searchField` |
| `FETCH_ONE` | fetch records (SINGLE) | `object_type`, `triggerInputCondition` |
| `CREATE` | create record | `object_type`, `rawPayload` |
| `UPDATE` | update record by id | `object_type`, `recordId`, `rawPayload` |
| `DELETE` | delete record by id | `object_type`, `entityId` |

They are **object-agnostic** — the object is chosen per call via `object_type` — so five
cover every object the app has. Never ask for more.

`FETCH` and `FETCH_ONE` are the same action in two modes. They must be separate bindings:
`numberOfRecordsToFetch` is a stored literal and cannot be templated, because the node
gates `page`/`includeTotalCount` on `MULTIPLE`.

## Two rules that decide whether the call works at all

**1. Send the WHOLE stored input set.** Spread `storedInputs` and override on top:

```ts
inputs: { ...FETCH.storedInputs, object_type, triggerInputCondition, page, sortBy, searchField }
```

A subset is refused with `forbidden datasource : invalid input` — **even a subset made
only of overridable fields**. Sending just `object_type` fails.

**2. Only the `overridable` fields may hold a different value.** Change anything else —
even `page.limit` on a binding where `page` is not overridable — and you get the same
error. `{{ }}` decides what may *change*, not what may be *omitted*.

Every call also sends `context: { appName, resourceName }`, which is in the binding.
Omit it and it is `forbidden datasource` again.

## The filter — `triggerInputCondition`

**This is NOT the entity API's `{op, field, values}`.** That shape is accepted with a
**200 and silently ignored**: it returned all 32 records instead of the 8 that matched.

```ts
{
  operator: 'AND',            // or 'OR'
  filters: [
    { property: 'properties.status', filter: { operator: 'EQUAL', value: 'open' } },
  ],
}
```

- **`{}` means no filter** — but still send the key.
- **`value` is singular.** A `values` array errors the workflow (500). The exception is
  `IN`, whose `value` IS an array.
- **Property paths:** the record id is `id`; every schema field is `properties.<key>`.
  A bare `status` is accepted and matches nothing.

Verified operators, on 32 tickets of which 8 are `open` and 4 `closed`:

| filter | result |
| --- | --- |
| `id` `EQUAL` `<id>` | 1 |
| `properties.status` `EQUAL` `'open'` | 8 |
| `properties.status` `NOT_EQUAL` `'open'` | 24 |
| `properties.status` `IN` `['open','closed']` | 12 |
| `properties.status` `CONTAINS` `'ope'` | 8 |
| `operator: 'OR'` over two `EQUAL` leaves | 12 |

**Range operators are the short names** — `GT`, `GTE`, `LT`, `LTE`; a date is epoch
milliseconds.

Use `andFilter([...])` from `bindings.ts` — it returns `{}` for an empty list, which is
exactly what "no filter" needs.

## Reads go through `useData` — this is what fills the Data panel

A read is declared with `useData(id, 'storage', config)` from `@/lib/data`. It executes
the FETCH binding for you: whole `storedInputs`, filter, sort and paging all handled.

```ts
const { data: tickets, loading, error, total, hasMore } =
  useData<Ticket[]>('tickets', 'storage', {
    object: ENTITY.ticket,
    where: status
      ? [{ property: 'properties.status', filter: { operator: 'EQUAL', value: status } }]
      : [],
    sort: [{ field: 'properties.createdAt', order: 'DESC' }],
    limit: 50,
  })
```

`data` is the **records array itself** — `useData` has already unpacked the envelope.
It is `undefined` while loading and on error; `total`/`hasMore` come back beside it.
There is nothing left to extract (see "The response envelope"). Rows are not checked
against your types, so look up a stored value with a fallback:
`(STATUS_META[ticket.status] ?? STATUS_UNKNOWN).label`.

**Calling `useExecuteWorkflowNode` yourself works at run time and is INVISIBLE to the
Data panel** — the panel is built by extracting `useData(...)` calls from source, so a
read that bypasses it leaves the user's Data tab saying "No data flow yet" on an app
that is fully stitched. The first argument is that binding's stable id in the panel:
short, meaningful, stable across redesigns.

Writes have no `useData` equivalent — use the mutation hook with the CREATE / UPDATE /
DELETE bindings (see "Writing").

## Counts and paging

`data` is ONE page: at most `limit` rows, 200 when you pass none. **Always pass `limit`** —
size it to what the screen shows, and read past it with `offset`.

- **`total` is NOT a population count.** `fetch_records` returns no grand total — its
  output schema is `{objects, hasMore, cursor, innerHits}` — so `total` falls back to the
  length of the page you just read. Render it only for a single unpaged read where the page
  IS the set; never as "N records exist" beside a pager, and never off a `limit: 1` read,
  which reports 1. A stat card that must be exact reads the rows it counts (a `limit` that
  covers the set) and counts them.
- **`hasMore` is the honest end-of-list signal**, and it comes from the backend. Drive
  "Next" off it, not off arithmetic against `total`.
- **A list that can outgrow one page pages on the server**, never with a bigger `limit`:
  the page in state, `limit` + `offset`, and `{ field: 'id', order: 'ASC' }` last in
  `sort` so tied rows never repeat or skip. Search, filter and sort stay in `where` /
  `sort`, and changing one resets the page to 0.

```tsx
// src/data/orders.ts — return the whole result, so `hasMore` reaches the screen
export const ORDERS_PAGE_SIZE = 25
export const useOrders = (page: number) =>
  useData<Order[]>('orders', 'storage', {
    object: ENTITY.order,
    sort: [
      { field: 'properties.order_date', order: 'DESC' },
      { field: 'id', order: 'ASC' },
    ],
    limit: ORDERS_PAGE_SIZE,
    offset: page * ORDERS_PAGE_SIZE,
  })

// the screen
const [page, setPage] = useState(0)
const { data: orders = [], hasMore, loading, error } = useOrders(page)
const first = page * ORDERS_PAGE_SIZE
// …the rows from `orders`, then a range, NOT an "of N" — there is no N (see "Counts and paging"):
<span>{orders.length === 0 ? '0' : `${first + 1}–${first + orders.length}`}</span>
<Button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
<Button disabled={!hasMore} onClick={() => setPage(page + 1)}>Next</Button>
```

### A `*_count` on a record is history, not the current figure

A `total_*` / `*_count` on a summary or run record is what that one run saw, so a card
bound to it moves only when the user re-runs the automation — never on reload, however
much the source changed. Count the source object instead, as its own read. The field is
right in a historical row, where it describes that record.

**Name the event that changes a stat card. If the only answer is "the user presses a
button", it is wrong.**

## The raw call — filters, pagination, and what useData does for you

```ts
inputs: {
  ...FETCH.storedInputs,
  object_type: ENTITY.ticket,
  triggerInputCondition: andFilter(status
    ? [{ property: 'properties.status', filter: { operator: 'EQUAL', value: status } }]
    : []),
  sortBy: [{ field: 'properties.createdAt', order: 'DESC' }],   // 'ASC' | 'DESC'
  page: pageInput(50, 0),      // { paginateBy: 'OFFSET', limit, offset }
}
```

Never fetch everything and `.filter()` in JS — put the condition in the filter and
parameterize the wrapper (`useComments(ticketId)` filters on the parent id).

## Fetching one

`FETCH_ONE` takes a filter, not an id argument — so it reads by id **or** by any field:

```ts
inputs: { ...FETCH_ONE.storedInputs, object_type: ENTITY.ticket,
  triggerInputCondition: andFilter([{ property: 'id', filter: { operator: 'EQUAL', value: id } }]) }
```

```ts
// …or by a business key
andFilter([{ property: 'properties.slug', filter: { operator: 'EQUAL', value: slug } }])
```

Read one record only when you have its id: with no id, an empty `where` and `limit: 1`
return the first row.

## The response envelope — four ops, four shapes, ONE place you unpack them

Every storage op is the same POST through `useExecuteWorkflowNode`, which wraps the node's
output in `response`:

```
{ lookupReferences, response: { … }, id }
```

**Under that wrapper the four nodes do NOT agree**, and each shape is the node's own
declared output schema (uacode `configs/workflow-nodes/storage_by_unifyapps/`):

| node | under `response` |
| --- | --- |
| `fetch_records` | `{ objects: [...], hasMore, cursor: { next, previous } }` |
| `create_record` | the record, **BARE** — `{ id, entityType, properties, version, … }` |
| `update_record_by_id` | `{ success, object: { id, properties, … } }` — record **nested under `object`** |
| `delete_record_by_id` | `{ success }` — no record at all |

This is the whole reason a write goes through the shipped hooks. `extractRecord` knows all
four; hand-written unpacking knows the one you had in front of you. The update shape is
what caught it in a real app: `{success, object}` carries no `id` where a create does, so
code that read `response.id` fell through to the list path and threw
`unexpected fetch response: no response.objects` — **on a write that had already saved**.
The record was in the database and the screen reported a failure.

For a fetch, records are in `response.objects`, and **on the wire each row nests its schema fields**:
`{ id, properties: { title, status, … }, createdTime, modifiedTime, entityType, … }`.

**The helpers flatten that for you.** A record you get back from `useData` or any
`extract*` helper is FLAT — `ticket.title`, never `ticket.properties.title` — carrying
`id`, `createdTime` and `modifiedTime` alongside the schema fields. Storage bookkeeping
(`entityType`, `version`, `deleted`, `ownerUserId`) is dropped.

Two details worth knowing: `id` is always the RECORD id, even if the schema has a field
called `id` (the filter contract reserves it — `field: 'id'`, never `properties.id`);
and a schema field named `createdTime` wins over the row's own, since that is the one
your app means.

Note the asymmetry, because it catches people: **filters and sorts still use the WIRE
path** — `properties.status` — while the record you render is flat — `record.status`.
The filter runs on the backend, against the stored shape; the flattening happens here,
after the response arrives.

The helpers:

- `extractPage<T>(data)` → `{ records, total, hasMore, cursor }`
- `extractRecords<T>(data)` → just the rows
- `extractRecord<T>(data)` → one record — a SINGLE fetch, a CREATE, or an UPDATE
  (unwrapping `object` for the last); `undefined` for a DELETE, which returns no record

**They take the RAW envelope — the `data` of a `useExecuteWorkflowNode` /
`useExecuteWorkflowNodeMutation` call you made yourself** (`FETCH_ONE`, and every
write). `useData` already ran them for you.

**NEVER re-extract a `useData` result.** This is the single most common way a
backend-stitched app crashes at run time, and it builds green:

```ts
// WRONG — `data` is already Ticket[]. extractPage looks for `data.response.objects`,
// finds none, and THROWS `unexpected fetch response: no response.objects`. Nothing in
// a wrapper catches it, so the first successful fetch blanks the page.
function useTickets() {
  const { data } = useData<Ticket[]>('tickets', 'storage', { object: ENTITY.ticket, limit: 25 })
  return extractRecords<Ticket>(data)          // ← double unpack
}

// RIGHT — take it as it comes, and pass the states through.
function useTickets() {
  const { data, total, loading, error } = useData<Ticket[]>('tickets', 'storage', {
    object: ENTITY.ticket,
    limit: 25,
  })
  return { tickets: data ?? [], total, loading, error }
}
```

The tell is a helper named `records()` / `rows()` / `unwrap()` sitting on top of
`useData` in `src/data/`. If a wrapper's input came from `useData`, delete the
extraction — do not guard it with `try`/`catch`, and do not swap the array for `[]`.

The helpers **throw** on an envelope they do not recognise rather than returning `[]`.
An empty array would render "no records" for a response whose shape changed — the exact
silent failure this data layer exists to avoid. (They now pass an already-extracted
array straight through — but only in `bindings.ts` files written after that landed, so
an app provisioned earlier still crashes. Write the call site as though they did not,
and if you are fixing that crash in an existing app, fix the CALL SITE.)

## Lookup fields — a dropdown whose options are another object's rows

When `read_object` reports a field as a **LOOKUP**, its options are not in the
schema. They are **rows of another object**, so the app has to fetch them — there is no
list to hard-code, and hard-coding one is how the dropdown silently goes stale.

This works the same for **Single Select** and **Multi Select**. Only the stored shape
differs:

| | stored value |
| --- | --- |
| single-select lookup | the target row's `id` |
| multi-select lookup | an **array** of target row `id`s |

A bare id where an array belongs (or the reverse) is a value the field never matches.

**Fetch the options like any other read** — a wrapper in `src/data/`, going through the
same FETCH binding with `object_type` set to the TARGET object:

```ts
// src/data/employeeOptions.ts
export function useEmployeeOptions() {
  const { data, loading, error } = useData<Employee[]>('employee-options', 'storage', {
    object: ENTITY.employee,          // the LOOKUP TARGET, not the object being edited
    sort: [{ field: 'properties.fullName', order: 'ASC' }],
    limit: 200,
  })
  return {
    // `id` is the record id; the label is the TARGET's nameField — call
    // read_object on it to find out which field that is. The schema of the field
    // holding the lookup carries no display label of its own.
    options: (data ?? []).map((row) => ({ value: row.id, label: row.fullName })),
    loading,
    error,
  }
}
```

**Rendering a stored value means resolving the id back to a label** — the record holds
an id, not a name. Reuse the SAME fetched rows: build a `Map` once per screen and look
each id up in it. Never issue a request per row; a table of 50 rows must not make 50
calls.

```ts
const byId = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options])
// single:  byId.get(record.owner) ?? record.owner
// multi:   (record.teams ?? []).map((id) => byId.get(id) ?? id)
```

Fall back to the raw id when it is not found rather than rendering blank — an id with no
row behind it is exactly what an unenforced foreign key leaves, and a blank cell hides it.

**Filtering on a lookup field** matches on the stored id, so the filter value is an id:
`{ property: 'properties.owner', filter: { operator: 'EQUAL', value: employeeId } }`.

If `read_object` says the foreign key is **NOT enforced**, an id that does not exist
is accepted and stored, and every read that joins on it finds nothing. Only ever write an
id that came back from that object's own rows — never one a user typed, and never one you
composed.

## Writing — go through the shipped hooks

Writes use three hooks from `@/data` — `useCreateRecord`, `useUpdateRecord`,
`useDeleteRecord` — the write side of `useData`. They are shipped in `@/lib/data` (not
generated), and they own the two things write code kept getting wrong: the response envelope
(so a create hands back the real record) and the cache refresh. Wrap them one-per-object
(see "the shape to copy" below) and **never call `useExecuteWorkflowNodeMutation` yourself
for a storage write** — that is the path that re-exposes the envelope and the missing
refresh.

**An update `payload` is the whole record, not the edited fields.** The endpoint REPLACES the
properties map — it does not merge — so spread the current record and apply the edits:

```ts
await updateTicket(current.id, { ...toPayload(current), status: 'closed', notes })  // ✅
await updateTicket(current.id, { status: 'closed', notes })                         // ❌ drops every other field
```

`toPayload` (from `@/data/bindings`) strips the row stamps (`id`, `createdTime`,
`modifiedTime`) the read added — leave them on and the write is refused
(`additionalProperties: false`).

Getting this wrong fails in two different ways, and only one of them is loud. Fields the
object marks **required** are re-checked against what the write CARRIES, not against what
the row already holds — so if any required field is outside the edit form, every update on
that object is refused, while every create succeeds. Fields that are merely optional are
silently blanked instead.

`read_object`'s write contract lists the required ones. A field there that your form does
not edit — an audit stamp, a code, a status the server set — still has to ride along on
every update.

Keep `rawPayload` keys identical to the object's schema field names.

## Why the create hook returns the record, not the envelope

A raw write result is wrapped like a read — `{ response, id }` — and **there the
resemblance stops** (see "The response envelope"). A create puts the record bare under
`response`, its real id at `response.id`; an **update puts it one level further down**, at
`response.object.id`, beside a `success` flag; a delete returns no record at all. Meanwhile
the envelope's **top-level `id` is the binding's own dataSource id** — the `e_…` string in
`bindings.ts`, NOT the row. Both are `e_…`-shaped, so reading `.id` off a raw mutation
result type-checks and is wrong — and nothing fails until that id is USED:

- fed to a later `UPDATE` as `recordId`, the write throws
  `Entity with record ID : e_… does not exist in entity type : obj_…` — the loud case, and it
  only fires when a record is created and then updated (a batch that flips itself from
  `pending` to `completed`).
- stored as a foreign key on a child, where the FK is **not enforced**, it is accepted and
  every join finds nothing — silent, exactly as "Lookup fields" warns.

`useCreateRecord` / `useUpdateRecord` return `extractRecord(envelope)`, so app code reads
`created.id` and never touches the envelope. That is the whole reason a storage write goes
through the shipped hooks and never a raw `useExecuteWorkflowNodeMutation` — the raw path is
the one that puts the decoy `.id` back in front of you.

## Every write says what it changed

A read and a write are the SAME POST to the same endpoint — only the dataSource id differs —
so React Query files them as unrelated cache entries. A write that does not invalidate the
reads of its object leaves the list on screen showing the old rows until a reload — the most
common defect in a generated backend app, green build and all. **The shipped write hooks do
this for you**: each refreshes its own object on success, so you never hand-write a
`src/data/refresh.ts` or wire `onSuccess` yourself.

This is the shape to copy — a thin, typed wrapper per object over the shipped hooks:

```ts
// src/data/tickets.ts
import { useCreateRecord, useUpdateRecord, useDeleteRecord, ENTITY } from '@/data'
import type { Ticket } from '@/data/types'

export const useCreateTicket = () => useCreateRecord<Ticket>(ENTITY.ticket)
export const useUpdateTicket = () => useUpdateRecord<Ticket>(ENTITY.ticket)
export const useDeleteTicket = () => useDeleteRecord(ENTITY.ticket)
```

At the call site, the create hook hands back the CREATED RECORD — its real id at `created.id`
(that is `response.id`, never the envelope's node id):

```ts
const createTicket = useCreateTicket()
const created = await createTicket(payload)   // created.id is the new row's id
```

**Name a second object when a screen shows something DERIVED from the one you wrote** — an
audit row, a rollup, a count. The hook refreshes the written object on its own; pass the
extras through `refresh`:

```ts
export const useCreateStore = () =>
  useCreateRecord<Store>(ENTITY.store, { refresh: [ENTITY.auditEntry] })
```

Nothing can work that link out for you — a dashboard reading across objects goes stale
silently unless the write names it. (Do not reach for `useExecuteWorkflowNodeMutation` to get
`onSuccess`, and do not thread a list's `refetch()` down into the form — the shipped hook
already refreshes every screen reading that object.)

When an AUTOMATION is what changed the records, no write hook ran and there is no `refresh`
option to pass. Await the call, then `useRefresh(...objects)`:

```tsx
const refresh = useRefresh()
await submitApplication.call({ student_key })
refresh(ENTITY.task, ENTITY.activity)
```

`useRefresh` matches cached reads on the real key shape — the execute-node endpoint plus the
`object_type` in the request it was sent. A `queryKey` written by hand (`['storage', 'task']`,
or a binding id like `'staff-uploads'`) matches no entry and reports nothing, so the screen
stays stale with no error to find. An automation READ is a mutation and holds no cache entry
at all; call it again rather than invalidating it.

## Where the code lives

`src/data/` only. `bindings.ts` is generated; `useData` and the write hooks
(`useCreateRecord` / `useUpdateRecord` / `useDeleteRecord`, plus `useRefresh`) are shipped in
`@/lib/data` and re-exported from `@/data`. You write one thin wrapper per object beside them
(`useTickets`, `useCreateTicket`, …), and components import from `@/data`. Never call
`useExecuteWorkflowNode` / `useExecuteWorkflowNodeMutation` inside a component or page — and
never for a storage write at all, the shipped hooks own that.

Import both hooks from `@unifyapps/app-builder-sdk/hooks/workflow`. Never the bare
`executeWorkflowNode` function — it sends no `x-ua-app` header and the backend rejects
it in preview and deployed alike.

Pick by what the call IS: `useExecuteWorkflowNode` is a query (auto-runs, caches,
refetches) — reads only. `useExecuteWorkflowNodeMutation` fires when called — every
write. A query behind a button fires as soon as its inputs are non-empty and caches the
result, so the second press does nothing.

## Rules

- Never the entity API from app code, and never a hand-written dataSource id.
- Send the whole `storedInputs`; override only `overridable` fields.
- The filter is `{operator, filters:[{property, filter:{operator, value}}]}` — a
  wrong-but-parseable filter returns everything, silently.
- `properties.<key>` for schema fields, bare `id` for the record id.
- A search box over several fields is `search: { fields, expression }`, never one
  `ICONTAINS` in `where` — one leaf searches one column.
- Always send `page` on a MULTIPLE fetch; render loading, empty and error states.
- Every read names its `limit`. A list that can outgrow one page pages on the server with
  `limit` + `offset` and an `id` tiebreak last in `sort`, and ends on `hasMore`. `total` is
  the size of the page you read, not a population — do not render it as a record count.
- A figure that reads as current counts the source object, never a `*_count` on a summary
  record — that is what one run saw, and it freezes until the automation is re-run.
- `useData`'s `data` is ALREADY the records array — `extractPage`/`extractRecords`/
  `extractRecord` are for raw `useExecuteWorkflowNode*` results only. Unpacking a
  `useData` result a second time throws `no response.objects` on the first row that
  arrives.
- `object_type` is the entityType `create_object` returned — or, for an object the
  user named, its entityType verbatim (`read_object` confirms it). Read it from
  `ENTITY`, never retype it.
- Writes go through the shipped `useCreateRecord` / `useUpdateRecord` / `useDeleteRecord`
  (from `@/data`) — never a raw `useExecuteWorkflowNodeMutation`. The four storage ops return
  four different shapes (create bare, update nested under `object`, delete just `{success}`),
  and these hooks are the one place that knows all four; they return the written record and
  refresh the written object. Reading `.id` off a raw envelope gives the dataSource id, which
  throws `Entity … does not exist` when used as a `recordId`.
- Each write hook refreshes its own object; pass `{ refresh: [ENTITY.other] }` for a second
  object a screen derives from. No refresh means the save does not appear until a reload.
- After an automation that changed records, call `useRefresh(...objects)`. Never build a
  `queryKey` yourself — reads are not filed under a name, so a hand-written key silently
  matches nothing.
- An update `payload` is the WHOLE record, built with `toPayload(current)` — stamps stripped,
  keys identical to the schema field names.
