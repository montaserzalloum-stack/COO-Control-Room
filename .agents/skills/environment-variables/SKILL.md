---
name: environment-variables
description: Where a value the app needs belongs — a tenant environment variable, the app's own `app/.env`, or neither — and how to create, read, change and delete a tenant variable with `read_env_variables` / `manage_env_variables`. MANDATORY before you put ANY credential, API key, token, password or connection string anywhere in an app, and before you create or change a tenant variable. The rule it exists to enforce: anything the build can read is in the shipped bundle, and the bundle is public to every visitor — so a secret the app must USE is read by an automation, never by the app.
solution_description: Where a value belongs on UnifyApps — a tenant environment variable versus an app's own build config — and the rule that keeps a secret out of a browser bundle. Load before putting any credential into an app.
version: 2
---

# Environment variables, and where a secret lives

Two different stores get called "environment variables", and confusing them is how a
tenant's API key ends up readable by anyone who opens the app.

| | **Tenant environment variable** | **The app's `app/.env`** |
|---|---|---|
| Lives on | the platform, shared by the whole tenant | this app's git repo — **`app/.env` is TRACKED**, so anything in it is committed and travels with a clone |
| Who reads it | every app, page, automation and connection on the tenant | this app's build only |
| Changing it | takes effect on the next run, no rebuild | needs a rebuild and a republish |
| Your tools | `read_env_variables`, `manage_env_variables` | the file editor |

## The one rule

**Anything the build can read is in the shipped bundle, and the bundle is public.**

A visitor can open the browser's network tab and read every string Vite baked in. A
PRIVATE app changes nothing about this: the sign-in gate protects the *page*, not the
JavaScript asset. So:

- A `VITE_*` value in `app/.env` is public. Always.
- `VITE_X=${SOME_PLATFORM_VAR}` in `app/.env` is **also public** — the engine resolves
  that reference at build time and bakes the result in.
- Marking the platform variable **sensitive does not save you here**. The build-time
  fetch decrypts every variable it returns, sensitive ones included. The flag stops
  *browsers* reading the value through the platform's own API; it does not stop a build
  from baking it into a bundle a browser downloads.

So the question is never "where do I store this secret" — it is **"who reads it"**. A
secret is read by a server, and the app asks that server. For everything that is NOT a
secret, the bundle being public is simply a fact to accept, and `app/.env` is the
cheapest place to put the value.

## Where a value goes

**Most values need no platform environment variable at all.** `app/.env` on its own is a
complete answer, and it is the right one whenever the value belongs to this app: write
the line, read it with `import.meta.env`, done. Reach for the tenant store only for the
two things `app/.env` genuinely cannot do — hold a secret, or share a value with anything
outside this app.

Two questions decide it, in this order:

1. **Is it a secret?** Then it cannot live in the app at all, in any file — it is the
   credential row below, and the app reads it through an automation or not at all.
2. **Does anything outside this app need the same value** — another app, a page, an
   automation — **or must it change without a rebuild?** Then it is a tenant variable.
   Otherwise it is `app/.env`.

| What it is | Where it goes | How the app reads it |
|---|---|---|
| **An app-local value** — a page size, a chart threshold, a label, a feature flag you introduced, any non-secret setting only this app uses | **`app/.env` as `VITE_NAME=value`** (or just a constant in the source). No platform variable, nothing to provision. | `import.meta.env.VITE_NAME` |
| **A credential** — API key, token, password, client secret, connection string, signing key | Tenant variable, `sensitive: true`. Give it to the AUTOMATION or CONNECTION that calls the third party. | **The app never reads it.** The app calls the automation through a dataSource binding (`backend-integration`); the automation reads `ENV.NAME` server-side and returns only the result. |
| **Non-secret config shared beyond this app, or that must change without a rebuild** — a partner's base URL, a support address, a tenant-wide toggle | Tenant variable, `sensitive: false` | `useEnvVariables()` from `@unifyapps/app-builder-sdk` |
| **A tenant value the BUILD itself consumes and never ships** — a private registry token `bun install` reads through `app/.npmrc` | `app/.env` as `NAME=${TENANT_VAR_NAME}`, with **no** `VITE_` prefix | nothing in the app reads it; only the build does |
| **A non-secret tenant value that must be baked in** — a brand string, a build stamp | `app/.env` as `VITE_NAME=${TENANT_VAR_NAME}` | `import.meta.env.VITE_NAME` — and every visitor can read it too |

The third column is the whole point: rows 2 and 3 read the same store and differ only in
who does the reading, and that difference is the security boundary.

**Do not create a tenant variable for a value only this app uses.** The store is shared
with the whole tenant, so an app-specific entry in it is litter every other app and
automation sees, and it needs provisioning, a name nobody else will guess, and a read
before every build. A line in `app/.env` has none of that cost.

**The last two rows are one line apart and only one of them may hold a credential.** The
`VITE_` prefix is what decides whether Vite puts the value in the bundle, so a build-time
secret is safe in `app/.env` **only** while nothing prefixes it and nothing in `src/`
reads it — a registry token for `bun install` is the realistic case. Add `VITE_` to that
same line and you have published it. If you are unsure which row you are in, treat the
value as a credential.

### A third-party key is never a literal in source — even a publishable one

Some keys are *designed* for the browser: a Mapbox `pk.` token, a public analytics site id, a
publishable payments key. The bundle being public is not an argument for hardcoding them. They
still belong in configuration, for reasons that have nothing to do with secrecy:

- they are **billed and rate-limited against one account**, so the wrong one spends somebody
  else's money;
- they **differ per tenant and per environment**;
- rotating one means **editing and rebuilding the app** instead of changing a line of config.

Measured on a real build: `export const MAPBOX_DEFAULT_TOKEN = 'pk.…'` in
`src/types/delivery.ts`, imported into the store and assigned to `mapboxgl.accessToken`. The
token belonged to a dev account, the name matched no tenant variable, and it was committed into
the app's history. Rows 1, 3 and 4 of the table all existed; none of them was used.

So: **never invent a key, and never carry one over from a reference app or an example.** A key
you were not given belongs to someone else's account.

### A literal fallback is not a fallback — it is the value

The failure that looks most like compliance, measured on a real build:

```ts
// WRONG — and it reads as careful, which is why it survives review
const token = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoiZGV2…'
```

`app/.env` was never given a `VITE_MAPBOX_TOKEN` line, so the left side is `undefined` on
every render and **the literal is what ships**. The `import.meta.env` half is decoration. The
same build also left a second copy as `export const DEFAULT_MAPBOX_TOKEN = 'pk.…'` in a data
module, and a reviewer skimming the component saw `import.meta.env.…` and moved on.

**Two steps, and the first is the one that gets skipped:**

1. **Write the line.** `VITE_MAPBOX_TOKEN=<the value the user gave you>` into `app/.env`.
2. **Read it with no literal in the file at all** — `import.meta.env.VITE_MAPBOX_TOKEN`, and an
   empty state when it is missing (a map with no token renders a blank tile grid, not an error,
   so say so on screen rather than papering over it).

A value that must not reach a browser takes neither step: it goes in a tenant variable with
`sensitive: true` and is read by an automation.

### Reading a tenant variable at runtime

```tsx
import { useEnvVariables } from '@unifyapps/app-builder-sdk';

function SupportLink() {
  const { envVariables, isLoading } = useEnvVariables();
  if (isLoading) return null;
  const url = envVariables.SUPPORT_PORTAL_URL ?? 'https://help.example.com';
  return <a href={url}>Get help</a>;
}
```

Three things to know before using it:

- **Sensitive values are not in the answer.** The platform omits them server-side, so a
  name you know exists can read as absent here. That is the flag working.
- **Nothing is fetched on a PUBLIC app.** A public visitor has no session, so
  `envVariables` is `{}`. An app you made public cannot read tenant config this way —
  put the value in `app/.env`, or move the work into an automation.
- **Always have a fallback.** A variable the tenant has not defined is simply missing,
  with no error (see "Why a value came back empty"). Default to something sensible
  rather than rendering `undefined`.

If the import does not resolve in this app's SDK, the SDK predates the hook: bake the
value at build time via `app/.env` (non-secrets only) or read it in an automation.

## Working with the tools

Order matters, because a wrong name never fails — it saves fine and reads as empty at
run time. Settle the name before anything reads it.

1. **Read first.** `read_env_variables` with the exact `names` the build will use.
   A name that already exists is **shared with every automation and page on the tenant
   that reads it** — reuse it as it is. Never overwrite its value unless the task is to
   change that value for all of them. `name_contains` lists what the tenant already
   has, which is also how you find the house naming convention.
2. **Names are case-sensitive, and both spellings can exist.** `API_BASE` and
   `api_base` are two variables. Read the stored name back and use it exactly; never
   create a second variable differing only in case.
3. **A value comes from the user and nowhere else.** Never invent a credential, never
   copy one out of a record, a page, another variable or a connection, and never use a
   placeholder "for now". With no value, say what variable you need and why, and build
   the rest.
4. **Create it.** `manage_env_variables` with `operation: "create"` —
   `UPPER_SNAKE_CASE` unless the tenant names things otherwise. `sensitive` is
   **required** here and the call is refused without it: `true` for every credential,
   `false` only for a value any signed-in visitor may read. Letters, digits, `_` and
   `-` only; the backend does not enforce that, so a name outside it saves and then
   matches nothing.
5. **Read it back**, then build what reads it.

### A value is never repeated

A value lives in the variable only. Never write one into code, a plan, a commit
message, a comment, a report or a reply — refer to it by name. This holds for a
non-sensitive value too: people routinely save secrets without the flag. Telling the
user that a variable exists, its name, and whether it is sensitive is fine.

### Changing and deleting

- `operation: "update"` changes the value and/or the flag for **every reader on the
  tenant at once**, and it changes only what you send. Send no `value` to change the
  flag alone; send no `sensitive` to change the value alone. Sending `sensitive` on a
  value change you did not mean to re-classify is how a setting every page reads
  becomes invisible to all of them.
- `operation: "delete"` cannot be undone, and every automation, connection and page
  that reads the name then reads an **empty value** — the platform cannot list which
  ones those are, and they will not error. Only delete a variable you created in this
  build, for a thing that is now gone.
- A **platform-owned** variable (a system variable or a platform feature flag) is
  refused by the tools. Those are re-stamped by every deploy and switch platform
  behaviour tenant-wide. Leave them to a person; say so rather than finding a way round.

## Why a value came back empty

An empty value raises no error of its own — a request just goes out with a blank
header, and the run looks green. In order:

1. **The casing is wrong.** The most common cause. `read_env_variables` with the exact
   name the code uses.
2. **The variable does not exist.** The same read answers it. Nothing validates a name
   at save time.
3. **A browser asked for a sensitive value.** `useEnvVariables()` never returns one, by
   design. Read it in an automation, or set `sensitive: false` if it genuinely is not a
   secret.
4. **The app is public.** No session, so no tenant variables at all in the browser.
5. **The value itself is empty.** For a sensitive variable only the user can check that
   on the Environment Variables screen — no read, including yours, can show it.
6. **A `${NAME}` reference in `app/.env` resolved to blank.** The two `${NAME}` rows of
   the table are the paths that depend on the engine's build-time fetch being switched
   on for this deployment. Every deployed environment has it; a local run may not. The
   runtime hook and an automation do not depend on it.

## Never

- Put a credential in source, in a comment, or in **any** `VITE_*` name — in `app/.env`
  or anywhere else. A build-time-only credential nothing prefixes and nothing in `src/`
  reads is the single exception, and it is the build-time row of the table, not a licence.
- Call the platform's entity or workflow-builder APIs from the app to fetch a secret —
  a deployed app is not authorized the way your build tools are (`backend-integration`).
- Create a tenant variable for something only this app cares about. That is `app/.env`.
  The tenant store is shared; a build-specific entry in it is litter every other app sees.
- Log a value, echo it into a terminal command, or put it in a URL.
