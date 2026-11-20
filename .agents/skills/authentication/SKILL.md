---
name: authentication
description: How authentication works in the generated app — every app is PRIVATE by default (requires sign-in). Public vs private is the INTERFACE's security.type (set via update_app_security), which the SDK resolves automatically once the app passes its application/interface id to AppBuilderProvider; it only decides whether sign-in is ENFORCED. The agent ALWAYS builds and stitches all three auth routes — /login, /forgot-password, /update-password — on EVERY app, public or private, via the SDK auth hooks (@unifyapps/app-builder-sdk/hooks/auth). Load this whenever building any app.
version: 13
---

# Authentication — private by default, resolved from the interface

Every generated app is **PRIVATE by default**: its data lives behind a sign-in.
Public-vs-private is the **interface's `security.type`** (`'PUBLIC' | 'PRIVATE'`), set by
the user in the platform's **Privacy settings** — it is **NOT** a code toggle. The SDK
resolves it automatically: `AppBuilderProvider` (in `main.tsx`) is passed the app's
**application/interface id** (`interfaceId`), fetches `/auth/interface`, reads
`security.type`, and routes data to the authenticated or public endpoints accordingly.
So in code you never "make the app public" — you only decide whether to build a **login
page**.

**The application id is engine-supplied.** It is `import.meta.env.VITE_APPLICATION_ID`
(injected by the engine as build-time env; the value = the session id) and `main.tsx`
already passes it to `AppBuilderProvider`. Never hardcode a literal id, and NEVER delete
the `interfaceId` wiring or remove it from `AppBuilderProvider` /
`useIdentityProviders` — without it the SDK can't resolve the interface. This holds for
BOTH public and private apps.

Authentication is **independent of backend integration** — a `local` (localStorage) app
can still require login, and a `backend` app can be public.

**Always build all three auth pages — on EVERY app, PUBLIC or PRIVATE.** Build/keep and
stitch into the router: **`/login`**, **`/forgot-password`**, and **`/update-password`**
(reset password). The template already ships these routes and reference pages — keep them,
restyle them to match the app, and wire the sign-in surfaces per this skill.
Public-vs-private is the interface's `security.type` (set via `update_app_security`), and
it only decides whether sign-in is **ENFORCED** — NOT whether these pages exist:

- **PRIVATE** (the default) — sign-in is required; the login page is the entry point.
- **PUBLIC** — no sign-in is required to use the app, but the login / forgot-password /
  update-password routes **still exist and stay wired** (optional sign-in). Do NOT remove
  them for a public app.

Never delete or unstitch the login, forgot-password, or update-password routes for any app.

---

# Building a login page (AUTH: login)

The hooks come from **`@unifyapps/app-builder-sdk/hooks/auth`** (the package root
re-exports these too, but prefer the subpath for consistency). Auth hooks in app code
are fine — it is the ENTITY hooks that must never appear there; see `object-data`. Authentication is the browser **session cookie** —
`useIdentityProviderLogin` sets it and you redirect; there are no tokens to store or pass in
app code.

```tsx
import { useIdentityProviders, useIdentityProviderLogin } from '@unifyapps/app-builder-sdk/hooks/auth'
```

The auth hooks (exact shapes, from the SDK's types — do not guess):

| Hook / fn | Input | Output |
|---|---|---|
| `useIdentityProviders(applicationId?, options?)` | the application/interface id | React Query result; `data` = `{ objects: IdentityProvider[], … }` (a HITS envelope) |
| `useIdentityProviderLogin()` | `mutate(flow)` where `flow` is `{ type: 'sso' \| 'password' \| 'otp', identityProviderId, returnTo?, … }` | resolves to `{ redirectUrl }` |
| `useLogout()` | `mutate()` | logs out (clears the session cookie) |
| `useUserContext()` | — | `data` = the current user/customer details |
| `useGetApiUserContext(params?, options?)` | `params` (e.g. `{ includeRoles: true }`) + React Query `options` | `data` = `CurrentUserDetails` — the signed-in user, incl. **roles** (from `@unifyapps/app-builder-sdk/hooks/user`) |
| `useSendForgotPasswordEmail()` | `mutate({ username })` | emails a reset link (public — no session needed) |
| `useUpdatePassword()` | `mutate({ password })` | sets a new password for the signed-in user (requires session) |

## 1. Fetch the identity providers

`useIdentityProviders(applicationId?)` returns a React Query result; the provider
records live under **`data.objects`** — the same "records live under `.objects`" HITS
envelope the `backend-integration` skill teaches for search. Each record is an
`IdentityProvider`.

The `applicationId` argument is the **interface id** (NOT an object `entityType`) — the
same `interfaceId` value main.tsx passes to `AppBuilderProvider`. Read it from the
engine-supplied env (`import.meta.env.VITE_APPLICATION_ID`, injected at build time) —
never hardcode a literal id or invent a URL resolver:

```tsx
// The SDK does NOT re-export the IdentityProvider type — derive it from the hook return.
type IdentityProvider = NonNullable<
  NonNullable<ReturnType<typeof useIdentityProviders>['data']>['objects']
>[number]

// Engine-supplied at build time — never hardcode or delete it.
const interfaceId = import.meta.env.VITE_APPLICATION_ID
// ...
const { data, isLoading, isError } = useIdentityProviders(interfaceId)
```

## 2. Bucket the providers by `type` (the core logic)

An IDP's `type` (+ `configProvider`) decides which sign-in surface it drives. Filter to
**ACTIVE** providers first (`p.active !== false`) — inactive IDPs must not paint a
surface:

```ts
const isSso      = (p: IdentityProvider) => p.type === 'OPEN_ID' || p.type === 'SAML'
const isPassword = (p: IdentityProvider) => p.type === 'PASSWORD' && p.configProvider !== 'OTP'
const isOtp      = (p: IdentityProvider) => p.type === 'PASSWORD' && p.configProvider === 'OTP'
```

Default surface precedence when several exist: **SSO → password → OTP**.

## 3. Render three surfaces

- **SSO** — one button per provider. Label `idp.uiConfig?.button?.value ?? idp.name`,
  optional icon `idp.iconUrl`. Clicking completes login for that provider.

- **Password** — username + password form. Do **NOT** add any client-side validation on
  the **username** field — no email-format check, no regex/pattern, no "looks like an
  email" gating. Treat it as a plain text input and pass whatever the user types straight
  into `formData.username`. (A username may be an email, a handle, or anything the IDP
  accepts; the backend validates it, not the app.)
  **Every password field gets a show/hide toggle** — use the template's
  `PasswordInput` (`@/components/ui/password-input`), an `Input` wrapped with an
  Eye/EyeOff button that flips `type` between `password` and `text`. Don't render a
  bare `<Input type="password" />`.
- **OTP** — username-only form (the OTP is sent, then verified on a later step). Same rule:
  no validation on the username field.

## 4. Complete login with `useIdentityProviderLogin()`

One hook for every surface. Pass the flow that matches what the user filled in, then send
the browser to the returned `redirectUrl`:

```tsx
const login = useIdentityProviderLogin()

function submit(flow: Parameters<typeof login.mutate>[0]) {
  login.mutate(flow, {
    onSuccess: ({ redirectUrl }) => { if (redirectUrl) window.location.replace(redirectUrl) },
  })
}

// SSO:      submit({ type: 'sso',      identityProviderId: idp.id!, returnTo })
// password: submit({ type: 'password', identityProviderId: idp.id!, returnTo, username, password })
// OTP:      submit({ type: 'otp',      identityProviderId: idp.id!, returnTo, username })
```

`returnTo` stays a ROOT-RELATIVE path (the `?returnTo=` the gate put on the login url, or
`import.meta.env.BASE_URL`). The hook decides what actually goes out — absolute for SSO,
relative for credentials — and checks the path is same-origin before prefixing the app's
origin. Handing it an absolute url skips that check.

`replace`, not `href`: the login page must not stay in history, or Back after signing in
lands the user on it again.

**Do NOT use `useAuthLogin` for a login page.** It posts `/auth/login`, which forces
`returnTo` to a relative path. Credentials survive that — they never leave the page — but an
SSO provider redirects back, and the platform replays that relative value as a `Location`
header that resolves against the auth service, dropping the user on `<app>/auth/` with a raw
error payload. Same reason `getSSOLoginUrl` is not the answer either: it targets a deprecated
route and mints a session with no key binding.

## 5. Wire it as a route

The login page is a normal route rendering `<Login />` — like every route in the
generated app, under the template's **`BrowserRouter`** (clean URLs, e.g. `/login`),
whose `basename` is already derived from the engine-baked mount path. The template already
ships this route and a reference `Login.tsx`; don't add your own router or change the
basename.

## CRITICAL — never a blank page

Derive the active surface **during render** from the fetched providers, e.g.
`const mode = override ?? defaultMode`, where `defaultMode` comes straight from the
bucketed lists. **Do NOT** set the initial mode in a `useEffect` that writes state:
an effect leaves a blank first frame, and if the fetch errors or returns no providers
the mode never resolves and **nothing paints** (we hit exactly this bug).

```tsx
const { data, isLoading, isError } = useIdentityProviders(applicationId)
const objects = (data?.objects ?? []).filter((p) => p.active !== false)
const ssoIdps = objects.filter(isSso)
const passwordIdp = objects.find(isPassword)
const otpIdp = objects.find(isOtp)

const [override, setOverride] = React.useState<Mode | null>(null) // user switching surfaces
const defaultMode: Mode | null =
  ssoIdps.length ? 'sso' : passwordIdp ? 'password' : otpIdp ? 'otp' : null
const mode = override ?? defaultMode // resolved DURING render, not in an effect
```

Always render explicit **loading / empty / error** states so the page is never blank:

```tsx
if (isLoading) return <Spinner />
if (isError) return <ErrorCard message="Could not load sign-in options." />
if (!mode) return <ErrorCard message="No sign-in methods are configured for this application." />
```

# Reset & update password

Two optional surfaces beyond sign-in, same import
(`@unifyapps/app-builder-sdk/hooks/auth`). They are **independent of the login page** —
build either only when the plan asks for it.

- **Forgot password** (logged-OUT) — `useSendForgotPasswordEmail()` emails a reset link.
  Anonymous like `useIdentityProviders`: **no session required**, so it belongs next to
  the login surfaces. Collect a username/email and `mutate({ username })`. Same
  **no username validation** rule as the login surfaces — pass whatever the user types
  through; the backend decides whether an account exists (and by design the response does
  not reveal whether it did, so always show the same "check your email" confirmation).
- **Update password** (logged-IN) — `useUpdatePassword()` rotates the current user's own
  password. **Requires an active session** (identity comes from the session cookie), so
  build it only behind a signed-in surface (a settings / profile page), **never** on the
  public login page. `mutate({ password })` with the new password; on success the backend
  invalidates the user's other sessions.

```tsx
import { useSendForgotPasswordEmail, useUpdatePassword } from '@unifyapps/app-builder-sdk/hooks/auth'

// forgot password (public — no session):
const forgot = useSendForgotPasswordEmail()
forgot.mutate({ username })              // → emails a reset link

// update password (signed-in only):
const update = useUpdatePassword()
update.mutate({ password: newPassword }) // → sets the new password, logs out other sessions
```

**The SDK only triggers the reset email.** Setting the new password from the emailed
link is handled by the platform's hosted reset page — the SDK does **not** expose that
step, so a generated app collects the username, fires `useSendForgotPasswordEmail`, and
tells the user to check their inbox. Don't try to build the set-new-password screen.

## Stitch both routes whenever you build a login page

The template **already ships both routes** — `ForgotPassword.tsx` (`/forgot-password`)
and `UpdatePassword.tsx` (`/update-password`), both wired in `App.tsx` — exactly like it
ships `Login.tsx`. So **whenever you stitch a password login, keep and restyle these two
routes to match your login page** (same card, typography, and theme); do NOT delete them,
add your own router, or change their paths:

- **`/forgot-password`** — the login page's "Forgot password?" link already points here.
  Step 1 collects the username and calls `useSendForgotPasswordEmail().mutate({ username })`;
  step 2 shows the "check your email" confirmation (with a resend + back-to-login). No
  username validation.
- **`/update-password`** — the destination the SDK **auto-redirects to** when the backend
  returns an expired-password / first-login response (`x-ua-expired-password`, handled
  inside the SDK's fetch layer). It collects a **new password + confirm**, enforces the
  app's configured password policy via `usePasswordPolicy()` (**never hardcode the rules**
  — load the `password-policy` skill), gives
  both fields the show/hide eye toggle (`PasswordInput`), calls
  `useUpdatePassword().mutate({ password })`, and on success sends the user back to
  `/login` (the change invalidates the session, so they re-authenticate with the new
  password). This is why it can stand alone as its own route even though the hook needs a
  session — the redirect only fires for a user who just authenticated.

Match them to the login page's look, but keep the hooks, the paths, the validation, and
the redirect-to-`/login`-on-success behavior intact.

# Reading the signed-in user (and their roles)

**PRIVATE apps only — never call user-context on a PUBLIC app.** `useGetApiUserContext`
and `useUserContext` require an **authenticated session** (`/api/user-context` needs a
signed-in user). On a PUBLIC app the visitor is anonymous with NO session, so these calls
**fail** (401 / empty user). So:

- Use them ONLY when the app's `security.type` is **PRIVATE** (every visitor is
  authenticated).
- If the app is **PUBLIC**, do **NOT** use `useGetApiUserContext` / `useUserContext` at
  all — and if a build already added them (e.g. to show a name), **remove them**. There is no
  user to read; drive the UI off public data instead.

On a PRIVATE app, read the logged-in user's context — identity, customer, and **roles** —
with `useGetApiUserContext` from **`@unifyapps/app-builder-sdk/hooks/user`**. Pass
`{ includeRoles: true }` for roles (also `includeTeams: true` for teams). It answers WHO the
person is: their name, email, avatar, the id behind a "mine" filter, and the role their
landing page and screen guards follow. It does not answer whether they may take an action
(see "What the signed-in person may do" below), and it does not decide public-vs-private,
which the interface's `security.type` already owns.

```tsx
import { useGetApiUserContext } from '@unifyapps/app-builder-sdk/hooks/user'

const {
  data,
  isPending,
  isLoading: isLoadingUserContext,
} = useGetApiUserContext(
  { includeRoles: true },
  {
    query: {
      enabled: isLoggedIn,          // only fetch once the user is authenticated
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  },
)

// data is `CurrentUserDetails`: the user is at `data.user`, roles at `data.user.roles`
// (a RoleDefinition[], only populated because of includeRoles), customer at `data.customer`.
const user = data?.user
const roles = data?.user?.roles ?? []   // who they are: a badge, their landing, the screens they open; never an action's check
```

- **Gate the query on being logged in** (`query.enabled: isLoggedIn`) so it never fires
  for an anonymous visitor — the call needs a session and 401s without one.
- Roles are **only** present when you pass `includeRoles: true`; without it `data.user.roles`
  is undefined.
- This is a normal React Query result — always handle `isPending`/`isLoading` and the
  empty case, and read roles off `data.user.roles` (never assume they're at the top level).

## More than one role: a landing per role, a guard per restricted screen

Build the router from the plan's LANDING block and its "Who may open it" lines:

```tsx
// useAccess reads the roles from wherever the app identifies its viewer
const LANDING = [['Approver', '/approvals'], ['Requester', '/my-requests']] as const
const landing = LANDING.find(([role]) => roles.includes(role))?.[1] ?? '/no-access'

export function Landing() {
  const { isLoading, landing } = useAccess()
  return isLoading ? <PageSkeleton /> : <Navigate to={landing} replace />
}

export function RequireRole({ allow }: { allow: string[] }) {
  const { isLoading, roles, landing } = useAccess()
  const { pathname } = useLocation()
  if (isLoading) return <PageSkeleton />
  if (roles.some((r) => allow.includes(r))) return <Outlet />
  return pathname === landing ? <NoAccess /> : <Navigate to={landing} replace />
}
```

- Wrap every screen the plan restricted in `RequireRole`. `/` is a restricted screen or
  `<Landing />`.
- Send a denied viewer to their `landing`, never to `/`.
- `/no-access` is a screen of its own. While roles load, redirect nowhere.
- An app with `src/data/personas.ts` (generated, never edited) has its roles there: key
  LANDING, the guards and a role badge by `roleId`, and read the viewer's with
  `useMyPersonas(PERSONAS)` from `@/lib/personas`, never by role name.

## The signed-in user is NEVER authored — it is FETCHED

A generated app must not contain a literal standing in for whoever is using it. No
`const CURRENT_USER = { name: 'Sarah Chen', email: 'sarah@acme.com' }`, no `'Demo User'`
or `'Admin'` in a header, no avatar with baked-in initials, no user id pasted into a
"my items" filter, and no persona/user PICKER used as a stand-in for signing in. On a
PRIVATE app every one of those facts is already known to the platform — one
`useGetApiUserContext` call returns them — and a hardcoded one is wrong for every person
except whoever's name got typed.

Everything the UI knows about the viewer comes from that one call:

| what the UI needs | read it from |
|---|---|
| display name, email, initials / avatar | `data.user` |
| the viewer's id — "assigned to me", "my tickets", author filters | `data.user.id` |
| tenant / organization | `data.customer` |
| roles / teams: who they are, where they land, which screens they open | `data.user.roles` / `data.user.teams` (needs `includeRoles` / `includeTeams`) |
| whether they may take an action | not this call — `hooks/permissions`, below |

The same rule governs WRITES: when a record records who did something — `author`,
`owner`, `createdBy`, `assignee`, a comment's poster, an audit line — take the value from
`data.user` at submit time. Never a constant, never a name the user typed into a settings
screen, never the first row of a seeded users table.

**Seeded demo rows are a different thing.** Fictional people inside seeded records are
sample CONTENT and are fine (see `backend-integration`). The line: a fictional person in
a seeded row is data; a fictional person rendered as *the viewer* is a bug.

**A fallback name is the same bug with an extra step.** `user?.name ?? 'John Doe'` renders
a fake person every time the query is pending or fails. While `isPending`, render a
skeleton or an empty string; on error, render the error state — never a stand-in human.

**A BRIEF THAT NAMES THE SIGNED-IN USER IS NOT AN INSTRUCTION TO HARDCODE THEM.** A brief
routinely states the viewer's identity — "The signed-in user is dana@acme.com", "filter
where owner_email matches this email", "if unauthenticated, fallback persona is Dana Reed
(Operations Lead)". That is telling you **who will be testing the app**, so you can see the
personalised view populated. It is not telling you to write that person into the code, and
it does not outrank the rule above. Fetch the user with `useGetApiUserContext` anyway, and
let the "mine" filters compare against `data.user.id` / `data.user.email` at runtime — on
the builder's own screen that renders exactly the view the brief described, and it keeps
rendering the right one for everybody else.

**There is no correct version of `useCurrentUser()` that returns a constant.** The shape
this failure takes is always the same, and it looks deliberate rather than sloppy:

```ts
// src/lib/user.ts — WRONG, however reasonable the comment sounds
export const FALLBACK_USER: UserProfile = { id: 'usr_dana_reed', name: 'Dana Reed', … }

export function useCurrentUser(): { user: UserProfile; loading: boolean } {
  // Always return the designated lead per brief specification: "…"
  return { user: FALLBACK_USER, loading: false }
}
```

Three tells, any one of which means you have built this bug: a module under `src/lib/`
owning the viewer's identity; a constant named `FALLBACK_USER`/`CURRENT_USER`/`DEFAULT_USER`
that nothing actually falls back *from* — the fallback IS the only branch; and a hardcoded
`loading: false`, which is the giveaway that nothing is ever fetched. Quoting the brief in a
comment does not make it correct; it just records that the rule was read and set aside.

**On a PUBLIC app there is no viewer to read** (the hook 401s — see the rule above), so do
not call it and do not invent one either. Render the anonymous state — a sign-in link, or
a real input that asks for the name and stores it as app DATA — never a placeholder person
presented as the signed-in user.

## What the signed-in person may do

Pick the check by the question:

| the question | the check |
|---|---|
| who they are, where they land, which screens they open | their role, through `useAccess` (see "More than one role" above) |
| may they act on THIS record | `useRecordAccess` / `useCanAccessRecord` from `@unifyapps/app-builder-sdk/hooks/permissions` |
| may they take an action the brief ties to a permission key | `useHasPermission(groupId, key)` from `@/lib/permissionKeys`; `useCallableAllowed(binding)` when the automation's binding carries `permission` |

The record and key checks come from the backend, so they stay right when an admin changes a
role without a rebuild. `useHasPermission(groupId, key)` says whether the signed-in user
holds `key` in the permission group `groupId`, through a role held directly or through a
team. A brief that ties an action to a group id and key gives them to you: use them as
written, and gate that action's control on the key, never on a role name. The action's
automation checks the key, and a role name drifts from it the moment an admin gives the key
to another role.

Import the key hooks from `@/lib/permissionKeys`, never straight from the SDK. The app runs
whichever SDK its environment serves, and a named import of a hook that SDK lacks stops the
whole app from loading; the module reads it safely, and without it every control stays
visible while the automation behind it refuses people without the key.

```tsx
import { useHasPermission, usePermissions } from '@/lib/permissionKeys'

// the group id and the key exactly as the brief gives them
const REQUESTS_GROUP = '<group id from the brief>'

// show or hide: a boolean, false until the answer has loaded
const canApprove = useHasPermission(REQUESTS_GROUP, 'approve_request')
{canApprove && <Button onClick={approve}>Approve</Button>}

// the answer decides what to SEND: wait for isLoading to be false
const { has, isLoading, refetch } = usePermissions(REQUESTS_GROUP)
```

- The answer is false while it loads, so show/hide with the boolean form and read
  `isLoading` before choosing a request.
- Every call shares one request, which answers every key of every group, so a list of
  guarded rows costs one lookup. A key an admin changes shows on the next page load, with no
  rebuild; `refetch()` re-checks at once.
- It needs a signed-in session and the `interfaceId` that `main.tsx` already passes to
  `AppBuilderProvider` (that is which app the answer is for). Mount it on signed-in pages
  only: on `/login` a session-scoped request logs the user out.
- Like the user context, it needs a session: pass `{ enabled: isLoggedIn }`, and on a
  PUBLIC app do not use it at all (an anonymous visitor holds no key).
- A missing or empty group id turns the check off: `has()` is false and `isLoading` is
  false, which looks like a settled "no". Treat a missing id as a build error to fix, not as
  a denial.
- Hiding a control is tailoring — the automation behind the action is what refuses (see
  `automation-integration`).
- If the app has no `src/lib/permissionKeys.ts` (one created before it), or
  `@unifyapps/app-builder-sdk/hooks/permissions` does not resolve (TS2307, an app on SDK
  0.3), leave the control visible and say so in your reply: its automation still refuses
  people without the key.

## Rules

- **Private by default.** Every app requires sign-in unless the interface's
  `security.type` is `PUBLIC` (set by the user in Privacy settings). Public-vs-private is
  NOT a code toggle — the SDK resolves it from the interface once you pass `interfaceId`.
- **Application id is engine-supplied.** `main.tsx` (and the login page) read
  `import.meta.env.VITE_APPLICATION_ID`, injected by the engine at build time — never
  hardcode a literal id or DELETE the wiring, for public AND private apps. Without it
  the SDK can't resolve the interface or load identity providers.
- **Always build the auth routes.** `/login`, `/forgot-password`, `/update-password` are
  built and stitched on EVERY app, public or private. `security.type` only decides whether
  sign-in is ENFORCED, not whether the pages exist. Set PUBLIC only via
  `update_app_security` on explicit user request.
- **Never hardcode password rules.** They are the owner's config, read at runtime via
  `usePasswordPolicy()` — see the `password-policy` skill. And they apply ONLY where a
  password is SET (`/update-password`): validating the LOGIN password field locks out
  every user whose password predates a policy change.
- **Never hardcode the signed-in user.** Name, email, avatar, id, tenant, roles and
  every "who did this" stamp come from `useGetApiUserContext` on a PRIVATE app — no
  `CURRENT_USER` constant, no fallback name, no persona picker instead of a login.
- **Never call user-context on a PUBLIC app.** `useGetApiUserContext` / `useUserContext`
  need an authenticated session; a public app's visitors are anonymous, so the calls 401.
  Use them only on PRIVATE apps; remove any user/role usage from a public app.
- **Auth is independent of persistence.** Decide login-vs-public from whether the app
  has real users/accounts, NOT from whether data is `local` or `backend`.
- **Auth import path:** login/identity hooks import from
  `@unifyapps/app-builder-sdk/hooks/auth` (`useIdentityProviders`,
  `useIdentityProviderLogin`, `useLogout`, `useUserContext`, `useSendForgotPasswordEmail`,
  `useUpdatePassword`). The parameterized user-context hook `useGetApiUserContext`
  (roles/teams via `{ includeRoles: true }` / `{ includeTeams: true }`) imports from the
  separate `@unifyapps/app-builder-sdk/hooks/user` subpath. The checks of what the user may
  do per record (`useRecordAccess`, `useCanAccessRecord`) import from
  `@unifyapps/app-builder-sdk/hooks/permissions`; per key (`useHasPermission`,
  `usePermissions`) from `@/lib/permissionKeys`.
- **Login pages must never blank out:** derive the sign-in surface DURING render from
  the fetched providers (never in a `useEffect` that sets state), filter to ACTIVE
  providers, and always render explicit loading / empty ("no sign-in methods
  configured") / error states.
- **Auth is the browser session (cookie)** — `useIdentityProviderLogin` sets it and you
  redirect; no tokens to store or pass in app code.
- **Connector accounts are not sign-in.** The SDK manages them and asks the person to connect on first visit, so never build a sign-in form for a connector. The only connector UI the app draws is one "Manage connections" control that calls `openManageConnections()`; see `automation-integration` § Connector accounts.
- **Every login flow goes through `useIdentityProviderLogin`** — SSO, password and OTP
  alike. Never `useAuthLogin` or `getSSOLoginUrl` on a login page; SSO cannot survive the
  redirect back through either.
- **No username validation.** The password/OTP surfaces must NOT validate the username
  field (no email-format check, no regex/pattern gating). Accept any text and pass it
  through as `formData.username`; the backend is the source of truth. You may still keep
  the field `required` so an empty submit is prevented — that is not format validation.
- **Stitch the reset routes with the login page.** When you build a password login, keep
  and restyle the template's shipped `/forgot-password` and `/update-password` routes —
  don't delete them or change their paths. Keep their hooks
  (`useSendForgotPasswordEmail` / `useUpdatePassword`), the update-password policy (≥8
  chars, ≥1 uppercase, ≥1 special char, confirm-matches), and the redirect-to-`/login`
  on a successful update.
