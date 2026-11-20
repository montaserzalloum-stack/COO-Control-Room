---
name: roles-and-permissions
description: Use whenever a brief names or implies two kinds of person (agent/requester, admin/staff) — even if it never says "role" or "permission". Make real roles and logins, never a persona switcher. Covers the three platform nouns (permission group, role, team), the tools that create them (`list_access` first, then `create_permission_group` / `create_role` with `object_permissions`, `create_team`, `assign_role`, `create_app_user` — one REAL login per persona, whose password you must hand back), what the running app can read about the signed-in user (`useGetApiUserContext` with includeRoles/includeTeams), the per-record check (`useRecordAccess` / `useCanAccessRecord` from `@unifyapps/app-builder-sdk/hooks/permissions`) and the per-key check (`useHasPermission` from `@/lib/permissionKeys`), and the one rule that governs all of it — gating the UI on a role is TAILORING, never a guard, because a hidden control is still a reachable API, and a `where` clause the client sends is no stronger than a `.filter()` in the browser (anything the caller can add, it can remove) — data a role must not see needs its own object or a session-scoped workflow, decided while planning the DATA MODEL. Also covers what you still cannot do (per-record shares, rule-based teams) and why a `roles` table in app data, or a client-side persona switcher, is the worst possible substitute. Load it when the user ASKS for access control — different roles, who may do what, separate logins — which is usually a follow-on edit, not the first build; a brief that merely names several kinds of person is describing its domain, not requesting RBAC. When the ask does come, treat it as a DATA MODEL change and re-plan the objects: bolting role flags onto finished components is the retrofit that comes out fake.
version: 8
---

# Roles & permissions — tailoring in the app, enforcement on the platform

Access control here has **two halves that live in different places**, and almost every
mistake in this area is treating one as the other:

| Half | Where it lives | What it does |
|---|---|---|
| **Tailoring** | your React code | decides what RENDERS for this person |
| **Enforcement** | the platform (roles, grants, object permissions) | decides what the API ANSWERS |

You build the first, and you **configure** the second — roles, teams, permission groups
and who holds them are tools you have (below). What you must never do is present the
first as though it were the second.

> **The rule this whole skill exists for:** a block you hide is a control the person
> cannot SEE, not one they cannot USE. The data source behind it still loads, and the
> endpoint still answers a hand-written request. Use roles for tailoring; never for
> guarding.

## More than one kind of user? Make real ones

Once the user has ASKED for access control, this is the order — and most of the time you
are doing it to an app that already exists, which is fine and intended. (A brief that
merely names two kinds of person has not asked; build for one kind of user until they do.)

1. `list_access` — reuse what already exists.
2. `create_permission_group` / `create_role` with real `object_permissions`: one role per
   kind of person the brief named.
3. `create_app_user` per persona — a REAL login each, with `role_ids` set.
4. Build the UI against `useRecordAccess` / `useCanAccessRecord`, never against a name.
5. **Hand back every credential.** See the rule below.

### Never build a persona switcher

Unless the person explicitly asked for one, never build an in-app control that changes
who the viewer "is". The shape to avoid, exactly:

```tsx
// ✗ every part of this is wrong
const PRESET_PERSONAS = [
  { id: 'p1', name: 'Dana', role: 'agent' },
  { id: 'p2', name: 'Sam',  role: 'requester' },
]
const { currentPersona, setPersona } = useAppStore()
{currentPersona.role !== 'requester' && <BulkActions />}
```

That is a DEMO of access control, not access control. The roles are invented in app
code, the "switch" is a client-side state write any viewer can make, and every gate
built on it is decorative. Worse, it hides whether the real thing works: it looks
convincing in a screenshot and proves nothing.

The real version of what a switcher is pretending to show is two accounts you can
actually sign into, holding different roles. Create them, hand over both passwords, and
say which one to use to see which behaviour.

### Report every credential you create

`create_app_user` generates the password, returns it once, and stores it nowhere
recoverable. A password nobody is told is a locked account, so the run is not finished
until you have handed them over.

End your reply with one row per user you created — no omissions, no placeholders,
the password copied verbatim from the tool result:

| Name | Role | Username / email | Password |
|---|---|---|---|
| Dana K | Agent | dana@… | `…` |

Say plainly that this is the only time the passwords are shown.

**In the REPLY — never in the app.** Do not put a password in source, in a seeded
record, in a README, or in a "demo accounts" panel on the login screen. Measured, on a
run that had this rule: the agent skipped the reply entirely and wrote the three logins
into `Login.tsx` as a `PRESET_ACCOUNTS` array instead —

```tsx
// ✗ real platform passwords, committed to the repo and rendered to every visitor
{ name: 'Sarah Jenkins', username: 'sarah.jenkins@…', pass: 'Resolve@Desk#2026Lead!' }
```

Those are working credentials for real accounts. In app code they are in git, in every
clone, in the built bundle, and on screen before anyone has signed in — on a PRIVATE app
whose whole point is that only signed-in people get in. The chat message is the delivery
channel precisely because it is the one place they are not persisted into the product.

If a sign-in hint genuinely helps, the username alone is fine. The password goes in the
reply and nowhere else.

## The three nouns, and the join

| Noun | What it is | Shape | Made with |
|---|---|---|---|
| **Permission group** | a named bundle of permissions, scoped to an app | `{ id, name, applicationId, permissions: [{ name, displayName }] }` | `create_permission_group` |
| **Role** | what someone may do — per object, and per permission group | `RoleDefinition { id, name, applicationId, entityTypePermissions, entityPermissions }` | `create_role` |
| **Team** (user group) | a set of users, static or rule-based | `UserGroup { id, name, userIds?, criteria? }` | `create_team` |

**None of these is a person.** The join that binds a person to them is a **role mapping**,
and it is scoped: "Priya is an admin **of this app**" is a mapping, not a field on Priya,
and the same person can hold different roles in different apps. `assign_role` writes it.

## Creating them — you have a tool for each

These are **platform configuration, and you can write it.** Every tool below targets the
app you are building; you never pass an application id, and you cannot touch another app.

| The user says | Tool |
|---|---|
| "what roles exist?", "who can sign in?", or you need an id | `list_access(resource=…)` |
| "create a Manager role", "only approvers can sign off" | `create_role` |
| "make a Finance team", "everyone in support" | `create_team` |
| "the app needs view/edit/approve permissions" | `create_permission_group` |
| "make Priya an admin", "give Finance the approver role" | `assign_role` |
| "add a login for Priya" | `create_app_user` (see `app-users`) |

**Never tell the user this is done elsewhere in platform settings, and never build a
`roles` table in app data to imitate it.** A table called `roles` has no connection to who
can sign in: it looks like access control and controls nothing. That substitution is the
single worst outcome in this area, and it is what these tools exist to prevent.

### The order — vocabulary, then role, then the join

Do these in order. Skipping straight to `create_role` is the failure this section exists to
stop: it produces a named role that permits nobody to do anything, and a role's permissions
can never be added afterwards.

1. **Name the permissions first, before any role exists.** Go through the brief and list
   what people will actually DO — approve a ticket, reassign it, see internal notes, export.
   Whatever the record verbs (`READ`/`EDIT`/`APPROVE`/…) cannot express becomes a
   **permission group**: `create_permission_group(name=…, permissions=[…])`, which hands
   back a KEY per permission. Call `list_access(resource='permission_groups')` first and
   reuse a group that already means this.
2. **Then create each role WITH its permissions attached** — `object_permissions` for the
   record verbs, `permission_groups` for the keys step 1 returned. Both ride the
   `create_role` call; there is no way to add them later.
3. **Then join it to people** — `assign_role`, or `create_app_user(role_ids=[…])` for a new
   login. A role nobody holds has changed nothing.
4. **If several people are to share a role, make a team and assign the role to the team
   once** — `create_team(name=…, user_ids=[…])`, then
   `assign_role(principal_type="team", …)`. Assigning the same role to five people
   individually is five things to keep in sync; the team keeps up with membership on its
   own. Assign directly to a user only when the role really is for that one person.

A turn that ends having created a role but no permission group, or a role that was never
assigned to anyone, has not delivered access control — it has delivered names.

### Read before you write

Call **`list_access`** first, every time — `roles`, `teams`, `permission_groups` or
`users`. Reusing the "Manager" that already exists is right; a *second* role also called
"Manager" is worse than having none, because half the people end up holding the wrong one
and nothing looks broken. It is also where the ids for every other call come from.

It labels each role and team **`this app`** or **`tenant-wide`**. A tenant-wide role was
made for the whole customer and usually grants far more than the chat is about — reuse an
app-scoped one, and if only a tenant-wide role fits, say what it is before assigning it.

**`resource="users"`** lists the people who can sign in to this app, with their ids — that
is how "make Priya an admin" turns into an `assign_role` call for someone who already
exists. `create_app_user` returns the id of a login you create.

### The whole surface — create, read, update, delete

Every noun here can be changed after it exists. Reach for the UPDATE before you reach
for a second create: two roles called "Manager" is the failure this area is most prone
to, because half the people hold the wrong one and nothing looks broken.

| | create | read | update | delete |
|---|---|---|---|---|
| permission group | `create_permission_group` | `list_access('permission_groups')` | `update_permission_group` | `delete_access` |
| role | `create_role` | `list_access('roles')` | `update_role` | `delete_access` |
| team | `create_team` | `list_access('teams')` | `update_team_members` | `delete_access` |
| user | `create_app_user` | `list_access('users')` | `update_app_user` | `delete_access` |
| who holds what | — | `list_access` | `assign_role` | `assign_role(replace=True)` |

Three things the table does not say:

- **`update_role` and `assign_role` answer different questions.** `update_role` changes
  what the role MAY DO; `assign_role` changes WHO HOLDS it. Widening a role needs no
  re-assignment — everyone holding it picks the change up on their next sign-in.
- **`update_app_user` does not change access.** Name and properties only. Roles are
  `assign_role`, team membership is `update_team_members`, and no tool can change a
  password — the platform mints those and shows them once.
- **`delete_access` needs `confirmed=True` and a request from the user, in as many
  words.** Deleting access is not versioned: `restore` puts app SOURCE back, never a
  role, so there is no undo and everyone relying on it loses it immediately. Never use
  it to tidy up something you created by mistake — leave it and say so.

### `create_role` — and the argument that actually grants something

```
create_role(
  name="Invoice Approver",
  description="Can approve and edit invoices",
  object_permissions={"invoice_e12ab": ["READ", "EDIT", "APPROVE"]},
)
```

**`object_permissions` is the real grant.** It maps an `entityType` (the name
`create_object` returned) to what the role may do to those records, and it is what
`useRecordAccess` in the app reads back. A role created with only a name is a label: it
tells you who someone is and permits nothing, so an app that gates on it is gating on
nothing. If the user describes people who may *do* different things, the objects belong in
this argument.

**Send the grant with this call.** A role created empty is briefly live granting nothing, and
widening it afterwards is a second round trip — `update_role` exists for the case where the
need appears later, not as a way to defer the grant. A role's permissions can
never be added after it exists, and a second role with the same name is worse than having
none. So a `create_role` that would grant nothing — no `object_permissions`, no
`permission_groups` — is refused. If the role really is only an identity label, say so with
`identity_only=True` and it goes through; that flag is a claim that the app will never gate
an action on this role, so do not reach for it to get past the error.

Permission names come from the platform's fixed vocabulary — `READ`, `CREATE`, `EDIT`,
`DELETE`, `CLONE`, `DEPLOY`, `EXECUTE`, `EXPORT`, `IMPORT`, `APPROVE`, `TEST`,
`VIEW_RUNS`, and `ALL` as a wildcard. A name outside it is refused, on purpose: a
misspelling would be stored happily, match nothing, and leave a role that reads as granted
and behaves as denied.

`permission_groups` is the other half, and it is for the app's OWN vocabulary — see below.

### `create_permission_group` — the app's own vocabulary

Use it when the app needs permissions the record actions above cannot express — "Approve
budget", "Export payroll", "See margins":

```
create_permission_group(name="Invoices", permissions=["View", "Edit", "Approve"])
→ Invoices — id pg_… — View = view_a1b2c3d4, Edit = edit_9f0e…, Approve = approve_1c2d…
```

**What you pass is a LABEL; what comes back is a KEY.** On the platform a permission is
`{name, displayName}` where `name` is an opaque unique key and `displayName` is what a
person reads. Roles hold the KEY:

```
create_role(name="Approver", permission_groups={"pg_…": ["approve_1c2d…"]})
```

Quote the keys the tool returned — never retype the labels, and never invent a key.

### `create_team` — one mapping instead of many

A team is a set of people who hold roles together. `create_team(name="Finance",
user_ids=[…])` makes one with a **static** member list; `create_app_user(team_ids=[…])`
drops a new login straight into it.

"All of Finance can approve" is `assign_role(principal_type="team", …)` — **one** mapping
that keeps up with membership on its own, not one mapping per person.

The platform's other kind of team derives its members from a `criteria` rule over user
fields; you cannot create that kind, and for one that already exists "add Priya to Finance"
is meaningless — she joins by matching the rule, so the fix is her user record. `list_access`
marks those `rule-based membership`.

### `assign_role` — the join that makes it real

Creating a role gives it to nobody. `assign_role(principal_id=…, principal_type="user" |
"team", role_ids=[…])` is what makes someone "an admin **of this app**" — the mapping is
scoped to one app, so the same person can be an admin here and a plain user next door.

`principal_id` is an **id**, never a name or an email: get it from
`list_access(resource="users")` / `list_access(resource="teams")`, or from the
`create_app_user` / `create_team` call that made it.

It **adds** to what the principal already holds. The endpoint underneath writes the whole
set, so the tool reads the current one and merges; `replace=true` makes your list the
complete set and revokes everything else — use it only when the user asked to take a role
away. If the current set cannot be read, the tool refuses rather than writing, because a
silent revocation is the one failure nobody thinks to check for.

A brand-new login takes its roles in the same call: `create_app_user(role_ids=[…])`.

### Read it back — a success message is not proof

When the access setup is done, call `list_access` once more for `teams` and `roles` and
check what actually EXISTS against what you meant to build. Specifically: does each team
you created have its members, and does each team you meant to give a role actually hold
one.

This is not ceremony. A create tool reports the request it sent, so "Team 'Finance'
created — 2 member(s)" is a description of what was ASKED FOR, and a membership the
platform declined to store reads exactly the same. Measured: two teams created with
`user_ids` set, both reported with their member counts, both landed with **none** —
and nothing in the run said so. The same goes for a team nobody ever assigned a role
to, which is the easier mistake: it is created last, after every person already has a
role individually, so there is nothing left for it to do and no error to notice.

Two shapes to catch before you finish, both of which mean the team is decorative:

- a team with **no members** — the people were named but did not land, so
  `assign_role(principal_type="team", …)` will grant to nobody
- a team with **no role** — usually because the roles were assigned per person first
  and the team was made afterwards

If either is true, fix it — add the members, or map the role to the team — and if it
still will not hold, SAY SO in your reply rather than reporting the access setup as
done. An access model that looks right in the transcript and is empty on the platform
is the worst outcome in this skill: it is indistinguishable from a working one until
someone signs in.

### What you still cannot do

- **Per-record shares** (`POST /api/governance/share`) — granting one specific invoice to
  one person. Describe it; an admin does it.
- **Rule-based teams**, as above.
- **Tenant-wide roles and permission groups** — everything you create belongs to this app.

Say so plainly when one of these comes up. Do not build a lookalike in app data.

## The wire shapes, for when you have to explain them

You do not send these yourself — the tools do. They are here because the user will describe
access in these terms, and because two of them use **different vocabularies for the same
idea**, which is the trap.

**A role mapping** binds a principal to roles within a scope:

```jsonc
POST /api/governance/role-mapping
{ "principalId": "<user or team id>",
  "principalType": "u",           // "u" = user, "ug" = team. SHORT codes.
  "roleIds": ["<role id>"],
  "scopeType": "APPLICATION", "scopeId": "<applicationId>" }
```

Read one back with `GET /api/governance/role-mapping/{principalType}/{principalId}?scopeId=…&scopeType=APPLICATION`,
or everything a person holds with `GET /api/governance/role-mapping/user/{userId}/all`.

**A share** grants access to specific records — and here the principal types are the LONG
names, `GLOBAL` / `USER` / `USER_GROUPS` / `SPACE`:

```jsonc
POST /api/governance/share
{ "entityType": "<type>", "entityId": "<id>",
  "add": { "principals": { "USER": ["<user id>"],
                           "USER_GROUPS": ["<team id>"] },
           "roleIds": ["<role id>"] } }
```

`principals` is a map of principal TYPE to ids, so one call can share with people and teams
together. `add` / `remove` / `update` are separate keys — sharing is incremental, not a
whole-object write, so adding one person does not revoke everyone else.

**`u` here, `USER` there.** They are the same idea and not interchangeable: the long form
sent to role-mapping writes a mapping that matches nobody, and nothing errors.

## What the running app can read

**PRIVATE apps only.** This needs an authenticated session. On a PUBLIC app the visitor is
anonymous and these calls fail — see the `authentication` skill, which owns the
public/private rule.

```tsx
import { useGetApiUserContext } from '@unifyapps/app-builder-sdk/hooks/user'

const { data, isPending } = useGetApiUserContext(
  { includeRoles: true, includeTeams: true },
  { query: { enabled: isLoggedIn } },
)

const roles = data?.user?.roles ?? []   // RoleDefinition[] — only with includeRoles
const teams = data?.user?.teams ?? []   // UserGroup[]      — only with includeTeams
```

- **The flags are load-bearing.** Without `includeRoles` the field is `undefined`, not
  empty — and `[].some(...)` on undefined-coalesced-to-empty silently denies everyone.
- **Gate the query on `isLoggedIn`**, or it fires for an anonymous visitor and 401s.
- **Handle the pending state.** During the first fetch `roles` is `[]`, so a naive
  `isAdmin` is false and an admin briefly sees the non-admin UI. Render a loading state,
  never the denied state, while `isPending`.

Use this **only for tailoring** — greeting someone by name, showing the team filter
that matches them, ordering a nav by what they use. For "may this person do this?",
there is a real check, below.

### Using a team in app code

A team reaches the app as `data.user.teams` — `UserGroup[]`, so `id`, `name` and
`description`. What it is good for is the shape "show me MY queue by default":

```tsx
const teams = data?.user?.teams ?? []
const myTeamIds = teams.map((t) => t.id)
const inMyTeams = (ticket: Ticket) => myTeamIds.includes(ticket.assignedTeamId)

// tailoring: open on the viewer's own queue, let them widen it
const [scope, setScope] = useState<'mine' | 'all'>(teams.length ? 'mine' : 'all')
const visible = scope === 'mine' ? tickets.filter(inMyTeams) : tickets
```

Three things that make this correct rather than decorative:

- **Match on `id`, from the hook — never a name typed into the code.** Two teams can be
  renamed to each other's names; `t.name === 'Tier 1 Support'` breaks the day someone
  edits it in settings, and breaks silently, as "no tickets".
- **It is a DEFAULT, not a restriction.** `scope` lets them see everything, because this
  filter is a convenience. The moment it is the only thing standing between a person and
  another team's records, it is a gate — and a `filter()` in the browser is not one. The
  records still have to be refused by the backend, which is what the role's
  `object_permissions` and `useRecordAccess` are for.
- **Empty is not "no access".** A viewer in no team gets `[]`, which above means "show
  everything" rather than "show nothing". Decide that deliberately: silently rendering an
  empty screen to someone who simply is not in a team is the commonest way this lands
  looking broken.

## Asking what someone may DO — the actual check

`@unifyapps/app-builder-sdk/hooks/permissions` answers per RECORD (and per permission KEY,
below), from the backend's own permission lookup. It already accounts for roles, team
membership and per-record shares, and it stays right when an admin changes any of them
without a rebuild:

```tsx
import { useRecordAccess, Permission } from '@unifyapps/app-builder-sdk/hooks/permissions'

// the entityType is the suffixed name create_object returned, not the pretty one
const { canAccess, isLoading } = useRecordAccess(id, 'invoice_e12ab', Permission.EDIT)
```

**This is the other end of `create_role`'s `object_permissions`.** What you granted there
is what this reads back — so a role built without it makes every one of these checks
false, and the app looks broken rather than restricted.

**Two forms, and picking the wrong one is a bug rather than a style choice:**

| Hook | Returns | Use when |
|---|---|---|
| `useCanAccessRecord(...)` | `boolean` | you only SHOW or HIDE — a not-yet-loaded `false` costs a flicker |
| `useRecordAccess(...)` | `{ canAccess, isLoading }` | the answer picks a REQUEST — a mutation, a route, a payload |

`canAccess` is false while the lookup is in flight, and **a not-yet-loaded false is
indistinguishable from a denial**. Showing the denied state for a moment is a flicker;
*acting* on it sends the wrong request. So anything that decides what to DO reads
`isLoading` too.

`Permission` is the action vocabulary — `READ`, `EDIT`, `CREATE`, `DELETE`, `APPROVE`,
`EXECUTE`, and `ALL`, which is a wildcard satisfying every check. Passing several names
is **OR**: `[Permission.EDIT, Permission.DELETE]` asks whether the person holds either.
That is the opposite of the permission-group map below, where every name is required —
so ask for the single permission the action actually needs and the ambiguity never
arises.

**Per permission key** — for an action no single record stands for ("approve requests",
"export the ledger"). It answers whether the signed-in user holds a KEY in a permission
group, through a role held directly or through a team: the other end of `create_role`'s
`permission_groups`.

```tsx
import { useHasPermission, usePermissions } from '@/lib/permissionKeys'

// the group id and keys create_permission_group returned, copied into one module —
// never a key retyped from its label ('approve' is not 'approve_1c2d…')
import { APPROVALS_GROUP_ID, APPROVALS_KEYS } from './access'
const canApprove = useHasPermission(APPROVALS_GROUP_ID, APPROVALS_KEYS.approve)  // false until loaded
const { has, isLoading, refetch } = usePermissions(APPROVALS_GROUP_ID)         // the answer picks a request
```

The two-form rule above holds for it too. The key is matched exactly — there is no `ALL`
wildcard here. Every call shares one lookup; a key an admin changes shows on the next page
load, and `refetch()` re-checks at once (after an automation refused the user, say). Mount
it on signed-in pages only: on a login route a session-scoped request logs the user out.

The key hooks come from `@/lib/permissionKeys`, never straight from the SDK: the app runs
whichever SDK its environment serves, and a named import of a hook that SDK lacks stops the
whole app from loading. On an SDK without them every control stays visible and the
automation behind it refuses. The file ships with the app; an app created before it leaves
the control visible (see `authentication`).

## Roles are still not a gate

Even with the hook above, keep the two straight:

```tsx
// ✗ a guess about what a role implies, and stale the moment an admin edits the role
{hasRole('Admin') && <DeleteButton />}

// ✓ the question you actually meant
const { canAccess } = useRecordAccess(id, 'invoice', Permission.DELETE)
{canAccess && <DeleteButton />}
```

Reach for roles when the question is genuinely about identity ("show the manager
dashboard"), for `useRecordAccess` whenever it is about a record and an action, and for
`useHasPermission` when it is about an action a permission key stands for.
When you are unsure which you mean, that is the tell that you meant the permission.


## The permission map — the shape, and the rule that reads backwards

The same shape appears twice: as what a role HOLDS (`create_role`'s `permission_groups`,
stored as the role's `entityPermissions`) and, on the platform side, as what something
REQUIRES. Both are a **map of permission-group id → permission names**:

```json
{ "<permission group id>": ["<permission key>", "<permission key>"] }
```

Four things about it that are not guessable:

- **The names are per-group, and they are KEYS, not labels.** There is no global VIEW/EDIT
  vocabulary: a permission is `{name, displayName}`, the `displayName` is what a person
  reads and the `name` is an opaque unique key. Quote the keys `create_permission_group`
  or `list_access` returned; a name written from memory is a guess.
- **A REQUIREMENT is AND, both ways.** Every group listed must be satisfied, and every
  name within a group must be held. Two groups means the person must be in **both**.
- **So adding a group NARROWS access.** "Let managers *or* admins see this" written as two
  entries requires membership of both and usually locks everyone out. OR is one group
  containing both, not two entries. (A per-record permission CHECK combines the opposite
  way — see `useRecordAccess` above, where several names are OR.)
- **Absent means OPEN.** No map, or `{}`, means everyone. Restricting requires writing a
  real entry — and an id or name that does not exist is a requirement nobody can meet, so
  it hides the thing from **everyone**, silently.

## Building the UI

### One hook that answers "what can this person do?"

Read the signed-in user ONCE, at the top of the app, and turn it into named capabilities
there. Every call site then asks a question about the APP ("may I manage invoices?")
instead of a question about the platform ("does this person hold a role called Admin?"):

```tsx
// hooks/useAccess.ts — the only place role names appear
export function useAccess() {
  const { data, isPending } = useGetApiUserContext(
    { includeRoles: true, includeTeams: true },
    { query: { enabled: isLoggedIn } },
  )
  const roles = data?.user?.roles ?? []
  const has = (name: string) => roles.some((r) => r.name === name)

  return {
    isLoading: isPending,
    user: data?.user,
    teams: data?.user?.teams ?? [],
    // the app's vocabulary, not the platform's
    canTriage: has('Support Agent') || has('Support Lead'),
    canManageSLA: has('Support Lead'),
    isRequesterOnly: has('Customer') && !has('Support Agent') && !has('Support Lead'),
  }
}
```

Then at each site:

```tsx
const { canManageSLA, isLoading } = useAccess()

if (isLoading) return <PageSkeleton />        // never the denied state while loading
{canManageSLA && <SLASettingsCard />}          // tailoring: show what they can use
```

Why one hook rather than the test inline:

- **Role names live in exactly one file.** They are strings an admin can rename, and a
  renamed role should break one line, not thirty — and break visibly, not as a screen
  that quietly shows nothing.
- **`isLoading` is available everywhere it matters.** Scattered checks are where the
  pending state gets forgotten, and a not-yet-loaded `false` looks exactly like a denial.
- **It reads as a capability at the call site**, so "admins and finance leads" is one
  edit rather than a hunt.

### …and where that check is NOT enough

`useAccess` above is built from ROLE NAMES, which makes it **tailoring only** — the right
tool for showing a nav item, choosing a landing page, or hiding a card the person can do
nothing with. It is the wrong tool the moment the question is about a particular RECORD
("may they edit THIS ticket?"), because a role name is an inference about what the role
permits and goes stale the moment an admin edits it.

For that, ask the backend per record — `useRecordAccess` / `useCanAccessRecord` above.
And for anything that must actually be refused, remember neither one is the refusal:
`object_permissions` on the role is, which is why `create_role` had to carry them.

A useful split when you are unsure which you are writing:

| The question | Ask | Because |
|---|---|---|
| should this menu item exist? | `useAccess()` | a whole capability, no record in hand |
| should this row's Delete show? | `useCanAccessRecord` | it is about that record |
| should this mutation fire? | `useRecordAccess` (+ `isLoading`) | it picks a REQUEST |
| must this data never reach them? | neither — the role's `object_permissions` | the API answers a hand-written request |

### A `where` clause is not a boundary either — and this is the one that fools people

The `.filter()` warning above is easy to accept, and then evaded without noticing: instead
of filtering the rows in React you push the condition into the QUERY, where it looks like
the backend is doing the work.

```ts
// ✗ this is NOT scoping — it is the same client-side filter, one layer down
export function useTickets(requesterUserId?: string) {
  return useData('tickets', 'storage', {
    object: ENTITY.ticket,
    where: requesterUserId
      ? [{ property: 'properties.requesterUserId', filter: { operator: 'EQUAL', value: requesterUserId } }]
      : [],   // ← a requester who drops this gets EVERY ticket
  })
}
```

**The client composes the request, so anything it can add it can remove.** A `where` the
browser sends is a preference, not a permission: the role holds `ticket: READ` on the whole
OBJECT, the API is answering exactly what it was asked, and one edited request returns rows
the UI never intended to show. The same line of code with `.filter()` after the fetch and
with `where` inside it are equally weak — the second merely moves the decision into a
payload the same person controls.

This is how it lands in practice, and the tell is a boolean parameter named after a ROLE:

```ts
useTicketActivity(number, requesterSafe)  // where: eventType == 'public_reply'
useKnowledgeArticles(isRequester)         // where: status == 'published'
useApprovals(approverUserId)              // where: approverUserId == me
```

Each reads as access control and enforces nothing. The first is the worst of the three: the
UI hides the internal-note composer behind `canAddInternalNotes`, so the agent-only notes
feel protected, while every requester can READ them by dropping one clause.

**When data must be unreachable, make it unreachable by GRANT, not by query.** Two ways,
and only these two:

- **Separate the object.** If a role must never see internal notes, internal notes are not
  rows in an object that role holds `READ` on — they are their OWN object, and the role has
  no grant for it. Then the API refuses, whatever request arrives. This is a MODELLING
  decision, not a UI one — so when access control arrives as a follow-up on an app that
  already has screens (the usual case), re-plan the OBJECTS. Adding flags to finished
  components is the retrofit that comes out fake.
- **Scope it server-side.** Where the split cannot be made, the read goes through a
  workflow that derives the identity from the SESSION and never from a parameter the caller
  sends (see `automation-integration`). A workflow that accepts `requesterUserId` as input
  has the same hole with more steps.

A client-supplied `where` is still the right tool for what it honestly is: a default view,
a "my tickets" tab, a convenience. Write it — just never as the only thing between a person
and a record, and never for data the role is not allowed to read.

Whichever check you are on, name the CAPABILITY once rather than repeating the test.
A condition spelled out at each call site is a rename away from breaking, and it cannot
express "admins and finance leads" without being edited in every place:

```tsx
// ✗ the test, repeated at every site
{hasRole('Admin') && <DeleteButton />}
{hasRole('Admin') && <BulkActions />}

// ✓ the capability, named once
const canManageInvoices = hasRole('Admin') || hasRole('Finance Lead')
```

Three UI rules:

- **Hide navigation the person cannot use.** A menu item leading to a page that renders an
  error is worse than no menu item.
- **Prefer hiding to disabling** for a whole capability, and disabling to hiding for a
  single control in a form the person otherwise uses — a control that vanishes mid-form
  reads as a bug.
- **Never render a "denied" state during loading.** See the pending-state rule above.

And for the route itself, redirect rather than render nothing — a blank page is
indistinguishable from a broken one:

```tsx
if (isLoading) return <PageSkeleton />
if (!canOpenAdmin) return <Navigate to={landing} replace /> // their own landing (`authentication`), never "/"
```

## Rules

- **Permissions before roles.** Work out what people will DO and create the permission
  group(s) FIRST, then create each role holding those keys, then assign it. A role made
  before the vocabulary exists cannot be given the vocabulary afterwards.
- **A shared role means a team.** Two or more people getting the same role is a
  `create_team` plus one `assign_role(principal_type="team")`, not one `assign_role` per
  person.
- **`list_access` before you create.** Every time, for all three. Reusing the "Manager"
  that exists is right; a second one with the same name is worse than none.
- **A role with no `object_permissions` grants nothing.** It is a label. If the user
  described what people may DO, that belongs in the argument, or you have built a name.
  Pass the grant on the `create_role` call so the role is never briefly live granting
  nothing; a role that would grant nothing is refused unless you mark it
  `identity_only=True`, which claims the app will never gate an action on it. Widening
  it afterwards is `update_role`, never a second role with the same name.
- **Creating a role gives it to nobody.** `assign_role` (or `create_app_user(role_ids=…)`)
  is the join. A chat that ends after `create_role` has changed nothing for anyone.
- **A team gets the role once, not each member.** `assign_role(principal_type="team", …)`
  keeps up with membership on its own.
- **Verify, don't trust the confirmation.** `list_access` at the END too, and check the
  teams have their members and their roles. A create tool echoes the request it sent, so
  a membership the platform silently dropped reports as success — the only way to know
  it landed is to read it back.
- **Derive capabilities once, in one hook.** Read the user with
  `useGetApiUserContext` at the top of the app and expose named capabilities
  (`canTriage`, `canManageSLA`) plus `isLoading`. Role-name strings belong in that one
  file and nowhere else — a renamed role should break one line, visibly, not thirty
  screens quietly.
- **Ask the permission, not the role.** For "may this person do this to this record",
  use `useRecordAccess` / `useCanAccessRecord`; for "may they take this action", the key
  behind it with `useHasPermission(groupId, key)` from `@/lib/permissionKeys`. A role
  name is an inference about what
  a role permits and goes stale the moment an admin edits it.
- **Nothing you render is a gate.** Even a correct permission check decides what the UI
  SHOWS; the API still answers a request made without it. If data must not reach someone,
  it has to be refused by the backend. Shipping a render decision as security is the
  failure this skill exists to prevent.
- **Use the `{ canAccess, isLoading }` form whenever the answer picks a request.** A
  not-yet-loaded `false` is indistinguishable from a denial: as a flicker it costs
  nothing, as a decision it sends the wrong request.
- **Never invent a client-side permission system.** No `localStorage` role, no hardcoded
  admin email list, no `isAdmin` flag in app data that the app itself sets. The signed-in
  user's roles come from the platform, through `useGetApiUserContext`, or the app has no
  business claiming to know them.
- **One real login per persona — never a switcher.** A brief naming N kinds of person
  means N `create_app_user` calls with roles attached, not an `PRESET_PERSONAS` array and
  a dropdown. Build the switcher only if it was explicitly asked for.
- **Hand back every credential you created.** A table of name, role, username/email and
  password, verbatim, at the end of your reply. The password is shown once and is
  unrecoverable after; a login nobody can sign into is not a delivered feature.
- **A password goes in the REPLY, never in the app.** Not in source, not in a seeded
  record, not in a "demo accounts" panel on the login page. Those are real credentials:
  in app code they land in git, in the bundle and on screen before sign-in.
- **Never hardcode a role or team id in app CODE.** Ids are per-tenant and a role can be
  edited out from under you. Pass ids to the TOOLS, and in the app ask
  `useRecordAccess` — the answer stays right when an admin changes anything. The one id
  the app does carry is the permission group whose keys it checks, because
  `useHasPermission` takes it; keep it beside its keys in one module. That id is per
  environment too: where the group gets another id (a new tenant, a re-created group),
  every check reads false and the controls silently disappear, so that module is the one
  line to change.
- **Name the role the user named.** "Only admins", "restrict this to finance" describe a
  role roughly. Check `list_access` for one that already means it; create it with THEIR
  word if there is none; ask only when two existing roles both plausibly fit. Echo back
  the effect in plain words either way — who ends up able to do what.
- **`includeRoles` / `includeTeams` must be passed** or the fields are undefined.
- **PRIVATE apps only** — never call user-context on a PUBLIC app.
- **Roles are not app data.** Do not model a `roles` table to mirror them.

## See also

- `authentication` — public vs private, the login routes, and the user-context basics
- `app-users` — creating a sign-in account and mapping roles and teams onto it
  (`create_app_user`)
- `object-data` — where the app's data actually comes from, and therefore where a real
  gate would have to live
