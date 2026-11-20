---
name: backend-integration
description: How to build an app whose data lives in the backend (durable, shared records) instead of localStorage. Covers the build-time flow (create_object / create_records for objects you mint and seed; read_object + relationship mapping for objects the USER provides, which are used as they are — never re-created, never seeded — and are the only ones allowed when the user says to create no new objects) and the runtime CRUD in the generated app, which goes through four dataSource bindings executed via @unifyapps/app-builder-sdk/hooks/workflow — NEVER the entity API. MANDATORY whenever the plan says the app is BACKEND-STITCHED — load this BEFORE calling any entity tool or writing any data-access code. Authentication (login pages, making an app public) is a SEPARATE concern — see the `authentication` skill.
solution_description: How to build an app whose data lives in backend objects the solution already provides — the runtime CRUD in the generated app goes through dataSource bindings executed via @unifyapps/app-builder-sdk/hooks/workflow, NEVER the entity API. MANDATORY before writing any data-access code.
version: 16
---

# Backend integration — data in objects, not localStorage

Load and follow this skill whenever the plan says the app is **backend-stitched**.
The rule: **all app data lives in backend objects** — never hard-coded in the UI and
never persisted to localStorage. Two halves work together:

- **Build time (you, the agent):** the `create_object` and `create_records` tools
  provision the backend — an object (schema) and its seed rows. `create_object`
  returns the object's **`entityType`** name (a slug, e.g. `ticket`). ALWAYS give
  the object a `description` (its purpose, 1-2 sentences) and every schema field a
  help-text `description` (what it holds, expected format/values) — they show in
  the backend UI. **An object the user PROVIDES is not yours to provision** — you read
  it with `read_object` and use it as it is, seed rows included (next section).
  Creating and seeding is for the objects you add yourself.
- **Runtime (the app you write):** the app does CRUD by executing four **dataSource
  bindings** (`provision_data_sources`), targeting that same `entityType` as the
  `object_type` input. It must NEVER call the platform entity API — not
  `/api/entity`, not `/api/aggregation`, and none of the `hooks/object` entity hooks.
  Those are build-time tools authorized as the person running the build; a deployed
  app calling them is unauthorized. See "The four bindings".

Only use this when the plan wants **durable / shared** data. For purely local UI
state, keep using the zustand store.

## Seeding an object — pick the route by SIZE

`create_records` takes the rows two ways, and they are equals. Choose by how long the
seed is, BEFORE you start writing it out:

| seed | how | why |
| --- | --- | --- |
| up to ~25 rows | `records: [ {...}, {...} ]` — inline | short enough to type |
| longer, or many fields per row | `records_file: "app/seed/incidents.json"` | read engine-side, so its length is free |

**A long seed cannot go inline.** Your reply has a 16k-token ceiling; one realistic
table — 30 records with 20 fields apiece — is already past it, and the call comes back
truncated. That reads as a broken tool when it is only the wrong route. So for anything
substantial, generate the file first (a `python3` or `node` script in the terminal),
then hand over the path:

    create_records(entity_type=<the entityType>, records_file="app/seed/incidents.json")

One tool call, any number of rows. The path is relative to your working tree root and
must stay inside it. The file holds ONE JSON array of flat `{fieldName: value}`
objects — no wrapper key, no trailing prose, no `id` field (ids are generated). Rows
are written in bounded batches for you; the result says how many landed and names any
failed row by its index in the file, so you can fix the generator and re-run.

Two things to refuse outright: **trimming a realistic seed so it fits inline**, and
**abandoning the seed because a payload was too large**. Both leave the app opening on
empty tables, which is the one outcome this whole flow exists to prevent.

## Objects the user provided — use them as they are

An entityType the user names — in the brief, in the plan's `EXISTING OBJECTS` line, or
mid-chat ("use my `crm_account` object") — **already exists and holds their real data**.
It is part of the app's object model, handed to you rather than made by you. Use it as
is: never create a copy, never seed it.

You may still `create_object` for **additional** objects the app needs, and those you
create you seed normally (the flow above, 15+ realistic rows). Seeding belongs to
objects you mint — never to one they provided.

**Unless they said not to create any.** "Don't create new objects", "use only these" —
that is binding. Create none, build what their objects support, and say plainly what you
left out. Never route around it with a localStorage store, a hardcoded array or mock
rows: an app that silently mixes their real records with data you invented is worse than
one that is missing a screen.

| you might reach for | on an object THEY provided |
| --- | --- |
| `create_object` | **Don't.** It exists; `read_object` it. A copy is session-namespaced, holds nothing, and the app reads an empty table while the real one sits untouched — silently. |
| `create_records` to seed it | **Don't.** Those are production rows. Seed only what you created. |
| `update_object` to add a field | **Don't.** It REPLACES the schema — every field you omit is dropped, with its data. Tell the user what's missing and ask. |
| `<snake>_<sessionId>` naming | Use **their entityType verbatim** as `object_type`. The session-id suffix is only for objects you mint. |
| taking the fields from the brief/plan | **Don't** — see the rule directly below. The brief names the object; `read_object` defines it. Guessing fails silently in both directions. |

### The brief says WHICH objects. `read_object` says WHAT they are.

**Never bind a field from the brief.** A brief names the objects and carries their ids;
it does not define them. Every field key, type, `format`, enum value, `nameField`,
`primaryKeyField` and filterable flag comes from `read_object` and nowhere else.

This holds **even when the brief lists every field with a type**, which is the normal
case and the reason this rule needs stating. That list is a paraphrase: it was written
from a plan approved before the object existed, and the object can have been altered
since. It is close enough to look authoritative and wrong in the ways that do not raise.

A worked example, from a real build. The brief said:

```
- primary_pdf: object, file-uploader, required [url required]
```

The stored field declares ten members — `id`, `name`, `url`, `key`, `temporaryUrl`,
`fileType`, `mimeType`, `size`, `progress`, `isUploaded` — plus
`additionalProperties: true` and `required: ["url"]`. An app built from the brief's line
has to invent that shape. It will invent a plausible one, the write will be accepted, and
the field will hold `{}`.

The same asymmetry applies to every field type: a wrong filter key matches nothing
(200 + empty list, indistinguishable from "no results"), and a wrong payload key is
dropped on write. Neither raises.

So: `read_object` **first**, for every object the app touches, before writing a type, a
filter, a payload or a binding. There is no object simple enough to skip it, and a brief
is never complete enough to substitute for it.

### The form is not the write contract

Design the form from what the USER should type. Build the payload from the **schema**.
Those are different lists, and where they differ the payload wins.

`read_object`'s write contract names every field a create must carry. Some of them are
not things to ask anyone for — a business key, an audit stamp, a status that has a
default. The app fills those in itself:

| required, but not on the form | where the value comes from |
|---|---|
| a code / reference / business key | one past the highest code stored, in the format the stored rows use — from a read of its own, sorted `DESC` on that field with `limit: 1`. Every record one action writes carries that same code |
| `created_by`, `owner`, `submitted_by` | the signed-in user |
| a status with a declared default | that default |
| a timestamp the schema declares | `Date.now()` at write time |

A code the server makes (an auto-number field) or a workflow makes is displayed from the
call's response, exactly as returned; when the response has none, show none.

A create assembled only from the form's inputs fails on every required field the screen
does not ask for, with a 500 naming the first one it hits. The form is still right — the
user should not be typing an audit stamp — but the payload has to be wider than the form.

**The signed-in user is read live — never hard-code a human fallback.** `created_by` /
`owner` / `submitted_by`, and any approver or actor field, come from the user-context hook
(`useUserContext` / `useGetApiUserContext`), not a literal. A fallback like
`user?.email || 'Jane Doe'` ships a real person's name as the default, so when the context is
briefly unresolved the app records that that person — not the actual user — acted. With no
resolved user, send nothing for the field and let the server stamp it, or block the action;
never invent an identity or put a literal email/name in the payload.

**And use the schema's own values, not plausible ones.** A `single-select` field's
`oneOf` is a closed list: an object declaring `open` and `closed` rejects `in_progress`,
and a filter on an undeclared value matches nothing and returns 200. `read_object`
prints the accepted values per field; copy them rather than inventing a set that reads
well.

### 1. Fetch each provided object's schema and data

```
read_object(entity_type="crm_account")        # sample_limit=5 by default
read_object(entity_type="support_ticket")     # …once per provided object
```

It returns the stored **schema** — field keys, types, help text, enum values,
`nameField` / `primaryKeyField`, which fields are filterable — plus a **sample of the
real rows** and the row count. Those keys are authoritative: they are the app's
TypeScript types, its `properties.<key>` filter/sort paths, and the keys of
`rawPayload`. A wrong filter key **matches nothing** (200, empty list — indistinguishable
from "no results"); a wrong payload key is **dropped on write**. Neither raises. Use
`query_records` after it when you want more rows, or to prove a filter against real
data before you wire it into a screen.

If `read_object` errors, **relay it and stop** — an unknown entityType means you
have the wrong name, not that you should create one.

### 2. Map how they communicate

With the schemas in hand, work out the links **between** the objects — theirs, and any
you add — before designing a screen. The relationships decide the app's shape: which
list drills into which detail, what a detail page shows beneath it, what a child list is
filtered by.

- **Find candidates in the schemas:** a field on A whose values look like B's ids or B's
  `primaryKeyField` (`accountId`, `ticket_id`, `ownerEmail`, a category key matching a
  lookup object's name field). A name is a hint, nothing more.
- **Prove each link against real rows.** Take the values that field actually holds in A's
  sample and look them up in B:

  ```
  query_records(entity_type="crm_account",
                filter={"field": "id", "op": "IN", "values": ["e_…", "e_…"]})
  ```

  (filter on `properties.<key>` when the link is to a business key rather than the id).
  Rows come back → the link is real, and repeated values in A tell you it is many-to-one.
  Nothing comes back → it is **not** that link; don't build on it.
- **Build the flows on the verified map** — parent list → detail → child list filtered by
  the parent's id; a lookup object rendered as the label for the key pointing at it, not
  as a raw id. State the map you proved ("ticket.accountId → account.id, many-to-one")
  when you describe the app.
- **No provable link → separate surfaces.** Never join on a guess or invent a join field;
  say you found no connection and ask.

### 3. Then build

`provision_data_sources` once — the bindings are object-agnostic, so the same set reads
and writes every object, provided or minted — then the app code.

Fill the **`ENTITY` map** in `src/data/bindings.ts` with each object's id (local name →
entityType id), taken from what `create_object` / `read_object` / the brief handed you —
this is the one place you type an id by hand. Then, before you finish, run
**`verify_object_bindings`**: a wrong id here (a typo, a stale id from an edit build, or
one that merely looks real) compiles green and fails every request at run time with
`ENTITY_TYPE … not found`, which reads as a save that silently did nothing. It names each
bad binding; take the right id from the brief / `read_object` / the `create_object` result
and run it again until clean.

If a provided object comes back **empty**, build a real empty state and say so. Padding a
thin table, or seeding someone's live object, is not a default you get to take.

## Setup — already wired

- `@unifyapps/app-builder-sdk` resolves out of the box (no install step) — the
  template vendors the SDK under `src/@unifyapps/app-builder-sdk` and aliases the
  specifier to it. Always import via the `@unifyapps/app-builder-sdk` specifier;
  never reach into the vendored files by their internal path.
- The template's `main.tsx` already wraps the app in `<AppBuilderProvider>`, which
  mounts TanStack Query for the hooks. **Do not** add another QueryClient/provider
  and do not edit `main.tsx` for this.

## Where the data layer lives — `src/data/`

Every call goes through **`src/data/`**. One wrapper per object (`useTickets`,
`useCreateTicket`, …); components import from `@/data` and never call a hook
directly. The dataSource ids live there as module constants, in ONE place.

## The four bindings

The app does **not** talk to the entity API. It executes four saved **dataSource**
bindings — `provision_data_sources` mints them once per app and returns their ids:

| binding | hook | overridable `inputs` |
| --- | --- | --- |
| fetch | `useExecuteWorkflowNode` | `object_type`, `triggerInputCondition`, `page`, `sortBy`, `fields`, `searchField` |
| create | `useExecuteWorkflowNodeMutation` | `object_type`, `rawPayload` |
| update | `useExecuteWorkflowNodeMutation` | `object_type`, `recordId`, `rawPayload` |
| delete | `useExecuteWorkflowNodeMutation` | `object_type`, `entityId` |

The bindings are **object-agnostic** — `object_type` is passed per call — so these
four cover every object the app has.

The bindings write as whoever is signed in and check no permission key. An action the
brief ties to an automation and a key is not a record write: its control calls that
automation (`automation-integration`), which decides who may run it. Use the bindings for
the rest.

### Two rules, both verified against a live environment

**1. Send the WHOLE stored input set on every call.** `provision_data_sources`
returns each binding's `storedInputs` — spread them and override only what varies:

```ts
inputs: { ...FETCH.storedInputs, object_type: TICKET, page, sortBy, triggerInputCondition }
```

A subset is rejected with `forbidden datasource : invalid input` — **even a subset
made only of overridable fields**. Never hand-list the literals; spread
`storedInputs` so they cannot drift.

**2. Only the listed inputs may DIFFER from what was stored.** Give a non-listed
field a different value and you get the same error. `{{ }}` decides what you may
*change*, not what you may *omit*.

The `context` on every call is `{ appName, resourceName }` — both come back from
`provision_data_sources`. Omit them and it is `forbidden datasource` again.

Import from **`@unifyapps/app-builder-sdk/hooks/workflow`**. Never the bare
`executeWorkflowNode` function — it carries no `x-ua-app` header and the backend
rejects it in preview and deployed alike.

## A read

```ts
// src/data/tickets.ts
import { useExecuteWorkflowNode } from '@unifyapps/app-builder-sdk/hooks/workflow'

// from provision_data_sources — never hand-written
const FETCH = { id: 'e_...', context: { appName: '...', resourceName: '...' }, storedInputs: {/* … */} }
const TICKET = 'ticket_<sessionId>'   // the entityType create_object returned

export function useTickets(status?: string) {
  return useExecuteWorkflowNode({
    id: FETCH.id,
    context: FETCH.context,
    inputs: {
      ...FETCH.storedInputs,            // ALWAYS — a subset is refused
      object_type: TICKET,
      // filter — parameterize the wrapper, never fetch-all-then-.filter()
      triggerInputCondition: status
        ? { operator: 'AND', filters: [
            { property: 'properties.status', filter: { operator: 'EQUAL', value: status } },
          ] }
        : {},                            // {} = no filter, but still send the key
      sortBy: [{ field: 'properties.createdAt', order: 'DESC' }],
      page: { paginateBy: 'OFFSET', limit: 20, offset: 0 },
    },
  })
}
```

**The filter shape is not the entity API's.** It is
`{ operator, filters: [{ property, filter: { operator, value } }] }` — singular
`value`; a `values` array errors the workflow. The entity API's `{op, field, values}`
is accepted here with a **200 and ignored**: verified live, it returned all 32 records
instead of the 8 that matched. There is no error to read, so this shape is not
negotiable.

**Field paths:** the record id is `id`; every schema field is `properties.<key>`.
A bare `status` is accepted and matches nothing.

## A write

Writes go through the **shipped hooks** — `useCreateRecord` / `useUpdateRecord` /
`useDeleteRecord` from `@/data` (the write side of `useData`, shipped in `@/lib/data`). Wrap
them one-per-object; never call `useExecuteWorkflowNodeMutation` yourself for a storage write:

```ts
// src/data/tickets.ts
import { useCreateRecord, useUpdateRecord, useDeleteRecord, ENTITY } from '@/data'
import type { Ticket } from '@/data/types'

export const useCreateTicket = () => useCreateRecord<Ticket>(ENTITY.ticket)
export const useUpdateTicket = () => useUpdateRecord<Ticket>(ENTITY.ticket)
export const useDeleteTicket = () => useDeleteRecord(ENTITY.ticket)
```

Each hook returns the WRITTEN RECORD and refreshes its object:

- a create hands back the real new id at `created.id`. The raw create response is the same
  `{ response, id }` envelope as a read, and its top-level `id` is the dataSource (node) id,
  NOT the row — the hook returns `extractRecord(envelope)` so you never read the wrong one
  (used as a later `recordId` it throws `Entity … does not exist`).
- the saved row appears without a reload. A write that does not refresh its object is the most
  common defect in a backend app — read and write are the same POST, filed as unrelated cache
  entries. Pass `{ refresh: [ENTITY.other] }` for a second object a screen derives from.

An update REPLACES the record, so send the WHOLE thing built with `toPayload(current)`. The
full runtime contract — filters, pagination, the envelope, the payload shape — is in the
**`object-data`** skill.

## Always render loading / empty / error

Every read can fail or come back empty. All three states, every screen.

## Authentication & login pages — see the `authentication` skill

Authentication (login pages, making an app public) is **separate from object CRUD** and
now lives in its own skill. It is INDEPENDENT of persistence: a `backend` app may be
public and a `local` app may require login. When the plan's AUTH decision needs a login
page — or you want the public path — load the **`authentication`** skill
(`invoke_skill(name="authentication")`): it covers the `@unifyapps/app-builder-sdk/hooks/auth`
identity-provider / sign-in flow, the engine-owned `VITE_APPLICATION_ID` env var, and how
public-vs-private is the interface's `security.type`. Don't build auth from this skill.

## Rules

- **Never the entity API from app code:** no `/api/entity`, no `/api/aggregation`,
  and none of `useSearchEntities` / `useFindEntityById` / `useCreateEntity` /
  `useUpdateEntity` / `useDeleteEntity`. The running app uses the four bindings.
- **Import path:** every runtime data hook is
  `from '@unifyapps/app-builder-sdk/hooks/workflow'` — same path in every file.
- **Only the declared inputs are overridable** — anything else is dropped silently,
  with a 200 and no error.
- **Authentication is a separate skill:** login pages and making an app public live in
  the `authentication` skill, not here — load it when the plan's AUTH decision calls
  for a login page or the public path.
- **Use the exact `entityType` name** that `create_object` returned — or, for an
  object the user named, its entityType, unchanged. The app, the data and the
  bindings must all agree on it.
- **An object the user provided is used as it is** — `read_object` it, prove how it
  links to the others, and never re-create, `update_object` or seed it. Seeding is for
  objects you mint. If the user said to create no new objects, create none.
- **Real queries only:** always `sortBy` + `page`, and a `triggerInputCondition`
  for any subset (child-by-parent-id, status tabs, search). Fetch-all-then-
  `.filter()` in JS is a bug.
- **Query field paths:** filter/sort by the record id with `field: 'id'`; every
  schema field is `field: 'properties.<key>'`. A bare schema-field name silently
  matches nothing.
- Every create/update/delete refreshes what it changed, in the hook's
  `mutation.onSuccess` — `refresh(OBJECT)`, plus any other object a screen derives from it.
  A write with no refresh saves the record and leaves the list showing the old rows.
- Always render **loading, empty, and error** states around these hooks — network
  reads can fail or return nothing.
- The exact request/response field names are typed: let the imported types and your
  editor's TypeScript guide the `query` and `data` shapes. Keep `properties` keys
  identical to the object's schema field names.
- Auth is the browser session (cookie) — no tokens to pass in app code.
