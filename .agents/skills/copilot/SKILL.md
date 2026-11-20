---
name: copilot
description: Build a copilot / AI assistant / chatbot into the app — a REAL UnifyApps AI agent via the SDK copilot parts, or a hardcoded mock for a UI-only app. Load whenever the user asks for any of those.
version: 14
---

# Copilot — an AI chat inside the app

Load this whenever the user asks for a **copilot, an AI assistant, a chat, a chatbot, or
"let me ask questions about this data"**. There are two completely different builds behind
that one word, and picking the wrong one wastes the whole turn.

## Which copilot is this? Decide FIRST

One question decides it: **is there a real UnifyApps AI agent to talk to?**

| | build | when |
|---|---|---|
| **Path A** | the real copilot — SDK parts wired to an AI agent | the user has an AI agent (name or id — `find_ai_agent` resolves it) |
| **Path B** | your own copilot — hardcoded replies, no SDK | UI-only / demo / mock-data apps, or no agent id |

## Getting the agent — find it, confirm it, THEN wire it

The user will usually name their agent ("wire it to my Support Copilot"), not paste an id.
`<CopilotProvider>` needs the **id**, and the two are not interchangeable — so resolve the
name first, exactly as you would an automation.

(The agents live in the `ai_agent` entity type. The SDK's own prop docs call the id an
`e_ai_agent` value; no such entity type exists, so do not go looking for one.)

**Resolve it with `find_ai_agent`** — the copilot's equivalent of `find_automation`. Pass
`query`: the agent name (partial is fine) **or** an id. Either resolves.

```
find_ai_agent(query="Support Copilot")
  → {matches: [{id, name, description}], count, matchedBy: "name" | "id"}
```

Then run it exactly like the automation flow:

1. **count > 1** → **do NOT choose.** Show the user each `id` + `name` + `description` and
   ask WHICH id they mean. Several agents can share a word in their name.
2. **count 1** → **confirm before wiring**, the way `confirm_automation_mapping` makes the
   user approve before code is written. One line: "Wiring the copilot to **Tensor Builder**
   (`tensor_builder`) on `/copilot` — correct?" A wrong id is invisible until runtime.
3. **count 0** → tell the user, and ask them to check the name or paste the id from the
   agent's page in UnifyApps. **Never invent one** — a made-up id renders a chat that waits
   forever on a lookup that never resolves: a blank box, no error, nothing in the console.
4. **Never leave it empty to "fill in later".** `<Copilot agentId="">` renders the
   MissingAgentId card, which is a dead screen the user has to come back and fix.

Ids are slugs (`text_to_ui_tensor`, `tensor_builder`), not the `aiAgent_xxx` shape the SDK's
own prop docs suggest — so a name and an id are easy to confuse. Pass what the tool returned,
never what the user typed.

If the user wants a real copilot and has no id to hand: say exactly what you need, then
**build Path B in the meantime** so they have something on screen. Swapping B for A later is
one file.

---

# Path A — a real UnifyApps AI agent

## 1. The component already exists — edit it, don't rewrite it

`src/components/copilot.tsx` ships with the template, already assembled and commented. It is
**unreferenced on purpose**: no route imports it, so an app that never asks for a copilot
bundles none of it.

- **Do** edit that file — layout, chrome, which parts appear. It is ordinary app code. Keep
  its two stylesheet imports, `copilot.css` and then `./copilot-theme.css`: the second is
  what makes the chat follow the app's theme (§6).
- **Do NOT** import the SDK's prebuilt `<Copilot />` from `@unifyapps/app-builder-sdk/copilot`.
  It is compiled into the bundle: you cannot restyle it, rearrange it, or put your own header
  on it. The parts exist precisely so you don't have to.

## 2. Add the route — LAZILY

```tsx
const CopilotPage = lazy(() => import('@/pages/CopilotPage'))
// ...
<Route element={<Suspense fallback={<Skeleton className="h-full w-full" />}><CopilotPage /></Suspense>} path="/copilot" />
```

The copilot entry bundles the no-code runtime and every block a reply can render —
**~2.3 MB gzipped**. A static import drags all of it into the entry chunk, so every page in
the app pays for a screen most users never open. `lazy()` + `Suspense` is not a nicety here.

## 3. Five rules from the runtime — not negotiable

1. **Everything inside `<CopilotProvider>`.** Every part and both hooks reach the chat by id
   through the store the provider creates, and **throw** outside it.
2. **One `<CopilotChat>` and one `<CopilotHistory>` per provider.** Each resolves a single
   fixed block id in the provider's store, so MOUNT the chrome you want rather than
   CSS-hiding a second copy — `hidden md:flex` on a sidebar beside a drawer leaves two
   history lists in the tree. Two copilots on one screen = two providers with different
   `instanceId`.
3. **Import `@unifyapps/app-builder-sdk/copilot.css` once**, where the copilot is composed.
   The copilot has **no styles without it**: ~700 KB carrying the design tokens, all 18
   design-system component stylesheets and a scoped base layer. Omit it and you get exactly
   the symptom list in **§6(d)** — so check this import FIRST, before concluding the vendored
   SDK is stale. It cannot leak into your app: the tokens and base layer are scoped to the
   copilot's own `.ua-variables` root, the component rules are namespaced by their own class
   names, and Tailwind's preflight is deliberately **not** shipped (it is a global reset, and
   this stylesheet loads inside somebody else's app). It rides in the lazy chunk with the
   rest, so §2 defers this too. `./copilot-theme.css` comes right after it — the theme
   bridge (§6b); without it the chat paints in UnifyApps' palette, not the app's.
4. **Bounded height, with a `min-h-0` chain.** The chat fills whatever you give it, so the
   parent needs a real height. A flex child defaults to `min-height: auto`, so without
   `min-h-0` the conversation and `CopilotHistory` grow to fit every row and the *page*
   scrolls instead of the list.
5. **New chat and History are OFF; switching one on is uncommenting a line in
   `src/components/copilot.tsx`.** The template's `<Copilot>` is the chat alone, plus a
   title bar when it has a `title`. Its "New chat" and History controls are written in that
   file, but the lines in `<Layout>` that render them are commented out, so a copilot nobody
   decided about ships with neither. Decide from the job, and uncomment only what this
   app's assistant needs:
   - **New chat**, when people work through several questions without leaving the screen
     (a work panel, a full page): uncomment `<NewChatButton />`.
   - **History**, when people come back to past conversations, as on a full-page
     assistant: uncomment `<HistoryButton />` and `<HistoryList />`, and `<NewChatButton />`
     with them. It is a sidebar on a wide screen and a list over the chat on a phone or at
     `size="sm"`.
   - **Neither**, for a one-question helper.

   Both sit in the title bar, so the copilot needs a `title`. The file is shared by every
   copilot in the app, so an uncommented line turns its control on for all of them; two
   copilots that need different controls get a prop for it, added there. Never float a
   control over the conversation or give one a row of its own: an icon hovering over the
   greeting, or a lone "New chat" above the first message, reads as debris. Needing one more
   prop means ADDING it to `src/components/copilot.tsx`, never hand-rolling a provider in a
   page instead. Selecting a conversation switches the chat **on its own**: wire no
   callbacks.

## 4. Props — `CopilotProvider` / `CopilotConfigProps`

| prop | type | notes |
|---|---|---|
| `agentId` | `string` | **required** — the id `find_ai_agent` returned (a slug, e.g. `tensor_builder`) |
| `chatId` | `string?` | resume a conversation; omit to start fresh |
| `chatSource` | `string?` | tags the conversations this copilot creates AND narrows `<CopilotHistory />` to that tag — one per record gives each record its own history. Read only when a chat is created, so a record change needs `key={recordId}` |
| `runtimeContext` | `object?` | what the agent should know about where the copilot sits — the record and step on screen, as plain data (`{ journeyId, stage }`). It travels with each message; compared by value, so an inline object is fine |
| `showFollowUpPrompts` | `boolean?` | the agent's suggested next questions, as cards under its latest reply that send themselves. Default `true`; they appear only when the agent itself is set to suggest them |
| `placeholder` | `string?` | composer placeholder |
| `welcomeText` | `string?` | greeting above an empty conversation. A **literal string** — there is no interface behind the component, so `{{ }}` bindings do not resolve |
| `size` | `'lg' \| 'sm'` | `lg` (default) is full-width and can open the canvas beside the chat; `sm` is a narrow panel with no canvas |
| `variant` | `ChatVariants` | `'AI_AGENT'` (default) or `'LIVE_CHAT'` for a human. It is an enum — import `ChatVariants` rather than typing the string |
| `filters` | `UIFilter?` | narrows the conversation list **the agent reads from**; it does not filter `<CopilotHistory />` |
| `allowAttachments` | `boolean?` | attach-file control in the composer |
| `showMessageActions` | `boolean?` | per-message copy / retry / feedback |
| `appearance` | see §6 | message LAYOUT (`messageVariant`); the colours come from the theme |
| `dir` | `'ltr' \| 'rtl'` | **omit it** — the copilot inherits the document's `dir`; set it only to flip one screen |
| `colorScheme` | `'light' \| 'dark' \| 'system'` | which token set it paints with. A bare provider defaults to `light`; the template's `<Copilot>` follows the app's `.dark` (§6c) |
| `className` | `string?` | applied to the component root — **size the copilot by sizing this** |
| `instanceId` | `string?` | distinguishes snackbars when more than one is mounted |

That table is the whole surface of the SDK this template pins.

### The template's `<Copilot>` — the props it forwards

`src/components/copilot.tsx` exports `<Copilot>`, which forwards `agentId`, `chatSource`,
`runtimeContext`, `dir`, `size`, `colorScheme`, `appearance`, `placeholder` and `className`
to the provider, and adds one of its own, `title`, which draws its title bar. New chat and
History are not props: they are commented-out lines in the same file (§3 rule 5). Need
another prop from the table? ADD it there, never compose a second provider in a page.

- **`size="sm"` in a drawer, a side panel, or any column under ~640px.** The default `lg` lays
  the starters out four across and keeps room for a canvas beside the chat; squeezed into a
  narrow container it crushes them.
- **The header bar is the copilot's title bar.** Give it `title`, the SCREEN's name
  ("Assistant", "Ask Procurement"), and render no heading, card header or `SheetHeader` of
  your own around the copilot: two title bars stacked read as two widgets. In a drawer the
  bar is the sheet's header — `<SheetContent className="w-full bg-background p-0
  sm:max-w-lg">`, a `<SheetTitle className="sr-only">` for screen readers, and the copilot
  straight inside. The bar centres on the sheet's own close button and leaves it its corner.
- **Conversation starters appear ONCE, and they are the agent's.** The chat's empty state
  shows the starters configured on the agent, as cards that send themselves, and they go
  once the conversation starts. Add no second set — not above the chat, not under the
  composer, not in the drawer's header, not elsewhere on the page — whether it repeats the
  agent's questions or adds new ones: two rows of suggestions read as a bug. What is
  suggested is the agent's setting, changed on the agent in UnifyApps; what the answers are
  ABOUT is `runtimeContext`.

### One copilot beside many records

A copilot next to a journey, a ticket or an order needs its own conversation per record — and
none of the three parts is a prop you can invent.

- **`chatId` is an id the platform minted**, not a label you choose: read the live one from
  `useCopilotStatus().chatId`, store it against the record, and pass it back as `chatId` when
  the user returns. Until the first message creates the conversation — and again the moment
  `newChat()` runs — it reads `'new'`, a sentinel the SDK substitutes for a missing id, so
  store only `chatId && chatId !== 'new'`. A truthiness guard writes `'new'` over the record's
  real id, every record ends up holding the same value, and `'new'` handed back as `chatId`
  opens an empty conversation instead of the stored one.
- **It is the INITIAL conversation, seeded at mount.** Changing the prop under a mounted
  copilot switches nothing — give the provider `key={recordId}` so a record change remounts
  it, or call `goToChat(id)` from something the user clicks (never an effect, §5). Without
  one of those, a single conversation runs on unbroken across every record the user opens.
- **Tell the agent which record it is on with `runtimeContext`** — the record's id and the
  step or stage the user is on, as plain data. Without it the agent sees only the words typed;
  with it, a generic starter ("What is blocking this?") is answered about THIS journey.
- **Scope the history with `chatSource={`<kind>:${recordId}`}`**, so `<CopilotHistory />`
  lists this record's conversations only. Without it the list shows every conversation with
  that agent.

```tsx
<CopilotProvider
  key={journey.id}
  agentId={agentId}
  chatSource={`journey:${journey.id}`}
  runtimeContext={{ journeyId: journey.id, stage: journey.stage }}
>
```

## 5. Hooks — drive your own chrome

```tsx
const { isGenerating, chatId } = useCopilotStatus()
const { sendMessage, stopResponse, newChat, goToChat } = useCopilotActions()
```

- `useCopilotStatus()` reads the same store the chat writes, so it stays **in step with the
  stream** rather than lagging a callback. Use `isGenerating` to swap send for stop.
- `useCopilotActions()` methods resolve through the block ref, so they are **no-ops until
  `<CopilotChat />` has mounted**. Never fire one from an effect on first render.
- `sendMessage` takes an **object** — `sendMessage({ message: '…' })`. A bare string does not
  type-check, and it is the call every chip and shortcut you add goes through.
- **A chip outside the provider cannot send.** A page that renders `<Copilot>` and its own
  prompt row beside it has no `sendMessage` to call (the hook throws there), so the chip ends
  up setting app state or doing nothing — a control that looks live and is dead. There is no
  prompt row to build anyway: the agent's starters are the only ones (§4).
- History and "New chat" stay off until you uncomment them (§3 rule 5), and the template's
  title bar already places them. Composing your own, put `<CopilotHistory />` and
  `newChat()` in one bar too; `newChat()` is the same block method as
  `<CopilotNewChatButton />`.

## 6. Theming it — two surfaces, two mechanisms

This is where most copilot work actually goes. Be clear which half you are styling.

**(a) Your chrome — header, drawer, buttons, page shell.** Ordinary app code. Theme tokens
from `src/index.css` exactly like every other component: `bg-background`, `border`,
`text-muted-foreground`. No hex, no inline styles.

**(b) The SDK's internals — composer, starters, bubbles, buttons.** They paint from the SDK's
own design-system tokens (~2,000 variables: a purple brand, neutral greys, white surfaces, its
own radii). `src/components/copilot-theme.css`, imported by `copilot.tsx` right after
`copilot.css`, points those tokens at THIS app's theme:

| app token | becomes, inside the chat |
|---|---|
| `--background` | the chat's own surface — the template's `<Copilot>` paints it on its root |
| `--primary` / `--primary-foreground` | the accent: send button, links, focus, the agent's avatar orb, a tint on the user's messages |
| `--foreground` into `--background` | every neutral: text, borders, hover and quiet surfaces |
| `--card` | the composer, the starter cards, popovers |
| `--app-font-heading` | the greeting's title |
| `--app-radius` | every corner, the composer's included, scaled the way the SDK scales its own |

So the chat follows the theme with nothing passed — including a theme changed later, because it
reads the live tokens. **To change how the chat looks, change the theme** (`src/index.css`, the
`theming` skill), never the chat. Do not edit `copilot-theme.css` and do not write CSS against
SDK class names (`.ua-*`, `.copilot-*`, `Mui*`): the bridge's token names are pinned to the
SDK by a test, a selector you add is not, and it breaks silently on the next SDK version. A
`<CopilotProvider>` composed elsewhere is themed too — the bridge keys on the class every
copilot root carries — as long as `copilot-theme.css` is imported once in the app.

`appearance` is now for LAYOUT, not colour:

```tsx
<Copilot agentId={agentId} appearance={{ messageVariant: 'BUBBLE' }} />
```

`DEFAULT` leaves the agent's replies flush against the surface and tints only the user's
messages; `BUBBLE` puts the replies in bubbles too. Both come out themed.

**Do not pass message colours.** Inside the chat a class name resolves to the SDK's utility of
that name, not the app's: `bg-primary` there is the CARD colour, not `--primary`, so
`userMessage: { backgroundColor: 'bg-primary' }` paints the user's messages the colour of the
surface they sit on. `appearance.backgroundColor` is the one colour worth setting, and only
when the copilot sits on a surface it should not inherit (`bg-card`).

**(c) Light vs dark.** The template's `<Copilot>` follows the app's own dark mode — the `.dark`
class on `<html>` — with no prop. Pass `colorScheme` only to make the copilot DIFFER from the
page around it. A `<CopilotProvider>` you compose yourself does not follow it: it defaults to
`light`, so bind `colorScheme` to the app's theme there, never `'system'` in an app with a
toggle of its own (`'system'` follows the OS, so an in-app override leaves a dark page with a
light copilot).

**(d) If the copilot looks unstyled — check the CSS import, THEN suspect the vendor.**

A missing `@unifyapps/app-builder-sdk/copilot.css` (§3 rule 3) produces **exactly** the same
symptoms as a stale vendored SDK, and it is the far likelier cause because it is a line you
can forget. Confirm the import exists and runs once where the copilot is composed. Only when
it is definitely there does the list below mean the vendored SDK is stale.

**A stale vendored SDK is not something to patch in app code.**

The SDK's stylesheet ships everything the copilot needs: the design tokens, all 18
design-system component stylesheets, and a base layer scoped to the copilot's root. When it
is current, the copilot is styled. When it is not, you get a specific and recognisable set
of symptoms, all at once:

- send button square instead of circular, buttons rendered as plain rectangles
- thin black hairline borders instead of light grey
- icons at full-bleed size rather than 16px
- message bubbles with no padding
- an unstyled snackbar / feedback modal

That is the app's own Tailwind preflight winning against a bundle that is missing the rules
meant to beat it (v4 zeroes form-control radius; nothing of the SDK's is present to override
it). It is **not** something to fix in app code. Writing CSS overrides, `!important`, or a
local radius to "correct" it produces something that breaks on the next SDK version and
hides a one-line infrastructure fix.

Say the vendored SDK looks stale and needs re-vendoring. You cannot do it from inside the
generated app.

**Match the app, don't invent a look:** the radius, palette and type already arrive through
the theme; let `backgroundColor` inherit when the copilot sits on a themed surface, and check
`.dark`. If something inside the chat still looks off-theme, fix the THEME token behind it —
an SDK internal you cannot reach is better left than chased with a selector.

---

# Path B — your own copilot, hardcoded

For UI-only apps: a demo, a prototype, an app whose data is mocked, or a real copilot the
user wants to see before they have an agent.

**Import nothing from `@unifyapps/app-builder-sdk/copilot`.** Shipping 2.3 MB of runtime to
render canned strings is the one unforgivable mistake on this path. Build it from the app's
own primitives — the same Card / Button / Input / ScrollArea everything else uses.

## Make it feel designed, not stubbed

**Pick a persona that fits the app.** "Copilot" is a placeholder name. An ITSM app gets a
triage assistant; a finance dashboard gets an analyst. Name it, give it a one-line purpose
under the title, and write canned replies **in this app's domain vocabulary**, referencing
the same entities the rest of the app shows.

**Suggested prompts on the empty state.** Three or four, as clickable chips, shown once — in
the empty state, gone after the first message, never repeated under the composer. This is what
separates a designed mock from an empty box — and it quietly steers users toward the
questions you actually wrote answers for.

**Stream the reply.** An instant full paragraph reads as fake. Reveal it progressively and
keep it interruptible:

```tsx
type Msg = { id: string; role: 'user' | 'assistant'; content: string }

function useMockCopilot() {
  const [messages, setMessages] = useState<Msg[]>([])
  const [isGenerating, setGenerating] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>()

  const stop = useCallback(() => {
    clearInterval(timer.current)
    setGenerating(false)
  }, [])

  // clear the timer on unmount, or it writes into an unmounted tree
  useEffect(() => stop, [stop])

  const send = useCallback((text: string) => {
    const reply = replyFor(text)                      // your canned-response lookup
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: text }])
    setGenerating(true)

    const id = crypto.randomUUID()
    const words = reply.split(' ')
    let i = 0
    setMessages((m) => [...m, { id, role: 'assistant', content: '' }])
    timer.current = setInterval(() => {
      i += 1
      setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, content: words.slice(0, i).join(' ') } : msg)))
      if (i >= words.length) stop()
    }, 28)
  }, [stop])

  return { messages, isGenerating, send, stop, reset: () => setMessages([]) }
}
```

**Canned responses:** match on keywords against the app's domain, and always have a
fallback that stays in character and offers what it *can* answer — never "I don't know".

## The details that get skipped

- **Scroll**: pin to the bottom on new content **only if the user is already at the bottom**,
  or you yank the view while they are reading history.
- **States**: empty (persona + suggested prompts), typing (an animated indicator, not a
  spinner), and a plain reply. Match whatever loading/empty treatment the rest of the app uses.
- **Composer**: Enter sends, Shift+Enter is a newline; disable send while empty; swap send for
  **Stop** while generating — you built `stop`, so use it.
- **Accessibility**: the transcript is `role="log"` + `aria-live="polite"`, the input has a
  real label, and the send button has an accessible name when it is icon-only.
- **Never fake a failure.** Don't invent latency spikes or error states a mock cannot
  genuinely have.

---

# Both paths — make it beautiful, and make it look like THIS app

A chat is the most scrutinised surface you will ship: it is read closely, line by line, for
minutes at a time. A copilot that looks bolted on undoes the impression the rest of the app
worked for. The bar is not "functional" — it is that a user seeing it for the first time
cannot tell it came from a library.

Follow the `impeccable` and `frontend-ui-engineering` skills for general craft. What follows
is what is specific to a chat.

**Inherit the app's design language — do not invent one for the copilot.** Its radius is the
app's `--radius`. Its spacing steps are the app's. Its type scale, borders, shadows and
motion are the app's. If the app is dense and flat, a soft floating pastel chat is wrong
however pretty it is in isolation.

**One elevation change, not three.** The commonest failure is a card, inside a panel, inside
a sheet — three nested surfaces with three borders. Pick one container, let the messages sit
directly on it.

**Line length is the readability lever.** Cap the reply column around `max-w-[65ch]`. A
full-width paragraph on a wide screen is the difference between a chat that reads like a
product and one that reads like a log file.

**Rhythm over density.** Generous vertical space *between* turns, tight space *within* a
turn, so the eye groups a message with its own metadata rather than with the next speaker.

**The empty state is the screen users see most.** On Path A the chat draws it: the agent's
avatar, name and description, then its conversation starters as cards that send themselves.
**Rebuild none of it around the chat** — no header repeating the agent's name or purpose, and
no row of prompts anywhere near it: above the chat, under the composer or in the header,
restating the starters or adding new ones. The same content twice reads as a bug, and a
copied chip outside the provider cannot even send (§5). A drawer's title names the SCREEN
("Assistant"), not the agent — the greeting says who it is. On Path B you draw it yourself:
the persona line and 3–4 suggested prompts as chips, once — never a blank panel with a lonely
input.

**Quiet chrome.** Header actions are `ghost` and small, in the copilot's one bar beside its
title; the composer is the only emphasised control. A chat with three primary buttons in its
header has no focal point, and a control floated over the greeting or the first message reads
as debris (§3 rule 5).

**One surface, the app's.** The copilot paints the app's page background (`bg-background`),
and its composer and cards sit on it the way the app's own cards do. Give whatever holds it
the same surface — a drawer is `<SheetContent className="bg-background …">`, a page section
needs no card at all — so the assistant reads as part of the page, not a white widget on it.

**Use the app's `Button` for rows and actions — do not hand-roll a hover.** Two failures come
as a pair when you write your own: `hover:bg-accent` without `hover:text-accent-foreground`
leaves the label at its old colour, and `--accent` is a token a generated app is free to theme
to a saturated brand colour. A full-bleed row of that reads as an error state, not a hover.
`variant="ghost"` pairs background and foreground for you (`hover:bg-muted
hover:text-foreground`) and comes out `h-8` like every other control. If you do need custom
markup, inset it (`mx-2` + rounded) so the hover is a chip rather than an edge-to-edge band,
and always set the foreground alongside the background.

**Motion is a whisper.** A short fade or slide on a new message, nothing on every token, and
honour `prefers-reduced-motion`.

**Check `.dark` before you call it done**, and check the streaming state — most copilots look
right empty and fall apart mid-reply, when the typing indicator, the stop button and a
half-rendered message are all on screen at once.

**Placement follows the job.** A copilot that helps with the *current screen* belongs in a
right-hand `Sheet` opened from the header, with `size="sm"` and its `title` as the sheet's
header. The Sheet is then the only surface — `<SheetContent className="w-full bg-background
p-0 sm:max-w-lg">` with the copilot straight inside, no card in it — and a plain width class
like that one is honoured: the template's Sheet lets a caller's `w-*` / `sm:max-w-*` replace
its 3/4-width, `max-w-sm` default. A copilot that *is* the product gets its own route and full
height (`size: 'lg'`, which can open the canvas beside the chat), and is where History
usually belongs.

**Don't add a copilot to an app that didn't ask for one.**

## Do NOT

- import the SDK's prebuilt `<Copilot />` — assemble from parts
- invent an `agentId`, or leave `<Copilot agentId="">` rendering silently
- static-import the copilot route (~2.3 MB gzipped into every page)
- style SDK internals with your own CSS, or edit `copilot-theme.css` — change the app's theme
  tokens and the bridge carries them in (§6b)
- pass message colours in `appearance.customStyles` — `bg-primary` inside the chat is the
  card colour, not the accent
- rebuild the agent's greeting around the chat, or add prompt chips or a suggestion row
  anywhere near a Path A copilot — above it, under the composer, in its header. The agent's
  starters are the only ones; change them on the agent
- leave a copilot in a drawer or side panel at the default `size` — pass `size="sm"`
- "fix" an unstyled copilot with CSS overrides — that is a stale vendored SDK, say so (§6d)
- put a copilot part or hook outside `<CopilotProvider>`
- uncomment New chat or History "just in case" — leave them off unless this assistant needs
  them, and never float either over the conversation or give it a row of its own
- stack your own heading, card header or `SheetHeader` on a copilot — pass `title`; its bar is
  the title bar
- wrap the copilot in a white card or a `bg-popover` sheet on a themed page — it paints the
  app's page background, so give its container the same
- invent a provider prop — §4 is the whole surface
- render two `<CopilotChat>` — or two `<CopilotHistory>` — inside one provider
- pull the SDK copilot into a Path B mock
- give the copilot its own radius / spacing / type scale instead of the app's
- hardcode hex colours anywhere in either build
