# `<MapAreaTools>` and the copilot

How the map reaches an agent, and what the agent gets. Use `agentId` or `chat`, never both: a
screen holds one conversation.

- **`agentId` — always wire the copilot.** The panel is the app's copilot in its narrow form, and
  every question carries the selected area as `runtimeContext`: its outline, its count and
  summary, and the fields of up to 200 points inside it. Resolve the id with `find_ai_agent`
  exactly as the `copilot` skill says. With no agent, don't use this component at all — hand-roll
  the drawing and tell the user which agent to connect. Never mount a second `<Copilot>` for
  the same map. An agent that answers "I have no store data" is not reading
  its chat context: that is the agent's setup in UnifyApps, not this component — say so to the
  user rather than changing the map.
- **The screen already has its own copilot panel** (a solution's always-on assistant sidebar, a
  chat column): LINK it instead of passing `agentId`, or the screen shows two chats side by
  side with two conversations. The area joins that copilot's context and the card's questions
  land in its conversation; the map opens no panel of its own.

  ```tsx
  import { MapAreaTools, useAreaChat } from '@/components/map/MapAreaTools'

  const chat = useAreaChat(() => setAssistantOpen(true))   // opens your panel on each question
  <MapAreaTools map={map} points={stores} chat={chat} … />  // no agentId
  <Copilot agentId={STORE_AGENT} size="sm" link={chat} runtimeContext={pageContext} />
  ```

  Keep that `<Copilot>` MOUNTED while its panel is closed (hide it, don't unmount it): a
  question sent before its chat registers goes back to the area card after a few seconds. Don't
  build a second `mapArea` for its `runtimeContext` either — the link supplies it.
- **`context` — when the brief has an AGENT CONTEXT block for the agent** (a solution brief),
  that block is the contract: the agent reads exactly those fields and nothing named `mapArea`.
  Build them in `context` from the selected area (null = the whole map) and the points inside
  it. It replaces `{ mapArea }`. On a linked copilot, pass no `runtimeContext` of your own: it is
  merged in beside these fields, and the block allows no others. Pass `context` inline, or list
  everything it reads (filters, the open record) in its `useCallback`, or the agent keeps old
  values. It rides with every message and gets every point on the whole map: cap its lists.

  `areaGeoJSON(area)` is the outline for any boundary, geometry or polygon field. `area` is a
  `MapArea` — its outline lives in `area.shape`, so never cast it to another shape (an app that
  read `area.points` told its agent no area was ever drawn).

  ```tsx
  import { areaGeoJSON } from '@/components/map/MapAreaTools'

  context={(area, inside) => ({
    page: 'Store map', component: 'drawn area', objectType: 'store',
    boundary: area ? areaGeoJSON(area) : null,
    recordIds: inside.slice(0, 200).map((s) => String(s.id)),
    settings: { area: area?.name ?? null },
    valuesShown: { storeCount: inside.length /* …every field the block names */ },
  })}
  ```
- **`describe`** (optional) picks the fields sent per point — the ones the agent needs to answer,
  not ids, blobs or nested objects.
- **`suggestions`**: up to three questions written for THIS app's data, shown as chips on the
  area card. Nothing is stacked around the agent's chat — it opens on the agent's own
  conversation starters, which are a setting on the agent.
