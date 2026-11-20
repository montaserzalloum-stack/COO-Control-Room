---
name: content-security-policy
description: The app is served under a Content-Security-Policy — the platform's defaults plus what the OWNER configures, plus the external origins the engine grants automatically because your code reaches them. You neither write it nor read it, and there is nothing to wire up. Load this when a browser request is blocked by CSP (a fetch, an image, a font, an embedded iframe, a script CDN) so you report it instead of coding around it, and before editing app/index.html so you don't delete the block that carries the policy.
version: 4
---

# CSP — not yours to write, and not yours to work around

Every app is served with a `Content-Security-Policy`. It is the platform's shared default
set, plus the external origins the ENGINE grants automatically because your code reaches
them.
<solution:omit>
It also carries whatever the app's owner has configured on the app's interface record
(**Interface settings → CSP Manager**).
</solution:omit>
The engine sends it on the preview, the deploy server sends it on the published app, and
the build bakes a copy into `index.html`.

**None of that is your job.** Unlike the [password policy](../password-policy/SKILL.md),
there is no hook to call and no data to fetch — the app's code does not participate at
all. Your entire responsibility is the three things below.

## 1. Leave the `ua:csp` block in `index.html` alone

`app/index.html` ships an empty marked slot:

```html
<!-- ua:csp --><!-- /ua:csp -->
```

The build writes the app's policy into it. Delete it — or rewrite `<head>` in a way that
drops it — and **nothing fails and nothing warns**: the app just quietly stops carrying
its policy anywhere it is hosted outside the platform. Same rule as the
`<!-- ua:theme-font -->` block right next to it: the markers are engine-owned, keep them.

Never add a `<meta http-equiv="Content-Security-Policy">` of your own. A second policy
does not widen the first — **the browser intersects them**, so a tag you write to "allow"
something can only ever take permissions away, including from the real policy the owner
configured.

## 2. When an external origin is allowed for you, TELL THE USER

Write the code that calls the API you were asked for. After a green build the engine
reads the app's source, finds any external `https://` origin the policy would block, and
adds it to the app's CSP by itself — so the request works on the first load instead of
failing silently in the preview. When that happens your `build` result carries:

```
This app's Content-Security-Policy has been updated so these origins your code
reaches are not blocked:
  • https://api.open-meteo.com  (used in src/lib/weather.ts)
```

**Say it in your reply**, in one short line: which origin and what it's for.
<solution:omit>
Add that the user can remove it in **Interface settings → CSP Manager**.
</solution:omit>
This is a change to their app's security posture — small, derived from code they can see
in the diff, but theirs. Silently widening a policy and not mentioning it is the one way
this feature goes wrong.

Only origins written as plain strings in `src/` are found. An origin assembled at runtime
(`` `${base}/orders` `` where `base` comes from user input) is not, so it can still be
blocked — see §3.

## 3. A CSP-blocked request is an origin to allow, not a bug to code around

**Allowed by default:** the app's own origin and `*.unifyapps.com`; images and media from any
host, including `data:` and `blob:`; `blob:` URLs for workers, scripts, fetches and iframes;
`data:` fonts and Google Fonts; inline styles and scripts; and `eval`/WebAssembly. A fetch,
script, stylesheet, font, iframe, `<object>` or form post to another host is blocked unless its
origin is allowed. Never allowed: `fetch()` of a `data:` URL, and a `blob:` or `data:` URL in
`<object>`/`<embed>` (show a `blob:` PDF in an `<iframe>`). A Resource Control entry is one
`https://` URL and covers every request type to it.

In the browser console it reads roughly:

```
Refused to connect to 'https://api.acme.com/orders' because it violates the following
Content-Security-Policy directive: "connect-src 'self' https://*.unifyapps.com ..."
```

`connect-src` for a fetch/XHR/websocket, `img-src` for an image, `font-src` for a font,
`frame-src` for an iframe, `script-src` for a third-party script.

<solution:omit>
If §2 did not already allow it, **the fix is one entry in the app's settings, and only
the owner can make it:**

> Interface settings → CSP Manager → Resource Control → add `https://api.acme.com`.

Say that. Then stop. Do **not**:
</solution:omit>
<solution:only>
If §2 did not already allow it, **ask the user to approve the origin.** Once they do, write
it as a plain string in `src/` and rebuild; the engine adds it. Do **not**:
</solution:only>

- proxy the call through another origin to dodge the directive;
- inline a remote script or base64 an asset to get it past `script-src`/`img-src`;
- swap a blocked provider for a different one without being asked;
- add the meta tag from §1 hoping to allow it.

Each of those turns a thirty-second fix into a permanent workaround in the user's codebase, and the second one hides a real request behind a shape nobody will
recognise later.

One thing you CAN do first, and it usually works: put the origin in the code as a plain
string constant (`const API = "https://api.acme.com"`) and rebuild. That is exactly what
§2 detects, so the origin gets allowed — and it is better code than a URL assembled from
fragments anyway.
<solution:omit>
Reach for the settings-page instructions when that isn't possible.
</solution:omit>

**The policy is enforced by default**, so a violation means the request genuinely did not
happen — the data is missing, the image is broken, the embed is blank. Don't read the
symptom as a bug in your own code and start rewriting the fetch; read the console first.

An app whose owner has explicitly switched enforcement off gets
`Content-Security-Policy-Report-Only` instead, which logs the violation and lets the
request through. There the symptom is a working app with a console warning — still worth
telling the user about, because it breaks the day enforcement goes back on, and still not
worth working around.

## What you may still be asked to do

Building a login page, a signup form, an embedded view, an app that calls a public API —
all normal work, none of it changes because of CSP. Build it; if something it loads is
blocked, follow §3.
