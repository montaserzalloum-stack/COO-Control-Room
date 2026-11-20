---
name: map-actions
description: MANDATORY when users draw, select or lasso an area on a map and ask an AI agent about what falls inside it — territory or catchment planning, comparing one region with the rest, picking a group of stores or sites. Carries the prebuilt `<MapAreaTools>`: when to use it (only with an agent), its props, linking the screen's own copilot, `context` for an agent that reads fixed fields, and the layout it owns. NOT for plotting pins or routes — that is `maps`, which any map screen loads as well.
version: 7
---

# Map actions — the prebuilt `<MapAreaTools>`

The map itself — basemap, markers, clusters — is the `maps` skill. Pass the app's own map as is.

**Use it when** the map plots points (stores, sites, customers, assets) and users work with a
REGION of them: "which stores in this area need attention", territory or catchment planning,
comparing one region with the rest, picking a group to visit or assign — or the brief says
draw, select, lasso, or ask the copilot about part of the map. Not for a locator that finds one
pin, a map with no point data, or live tracking of things that move.

**Only with an agent.** It needs `agentId` or `chat` and will not build without one: every
question on it goes to a real agent. A map whose users draw and select but have no agent to
ask hand-rolls its drawing and selection, with no ask box. When an agent is added to that map
later, replace ONLY its drawing tools (draw modes, handles, the inside-area test) with this
component wired to the agent. Keep what the screen does with a selection (a tray, compare,
saved areas) and feed it from `onSelectionChange`. Never leave two drawing layers on one map:
they fight for the same pointer events and show two toolbars.

It is THE draw-and-ask layer: a toolbar (select, pan, rectangle / circle / pentagon, polygon by
points, lasso, colour and line, undo / redo / delete, `?` for its keys), the points inside each
area counted live, a card under the selected area with its count and average, and a panel that
IS the app's copilot. **Import it rather than hand-rolling drawing tools.** A second drawing
layer beside it (`@mapbox/mapbox-gl-draw`, terra-draw, geoman) fights it for the same pointer
events and puts a second toolbar on the map. A screen whose job is EDITING saved shapes (vertex
snapping, GeoJSON features written back) may use one of those instead of it, not alongside it.

```tsx
import { MapAreaTools } from '@/components/map/MapAreaTools'

<div className="relative h-full">
  <div ref={ref} className="h-full w-full" />
  <MapAreaTools
    map={map}                 // the app's map, handed over in m.on('load'), never before
    points={stores}           // the records the map plots: { id, lng, lat, name, … }
    pointLabel={{ one: 'store', other: 'stores' }}
    metric={{ label: 'Attainment', value: (s) => s.attainment }}
    agentId={STORE_AGENT}     // the id find_ai_agent returned — the `copilot` skill
    suggestions={['Which stores here need attention?', 'Plan a visit route']}
  />
</div>
```

**Four things every build gets right:**

- **One copilot per screen.** A screen that already has a copilot panel (a solution's assistant
  sidebar, a chat column) links it with `useAreaChat` and passes no `agentId`, or it shows two
  chats side by side. A brief that asks for its own "Ask AI" drawer or assistant panel beside
  the map is that copilot: link it, never a second `<Copilot>` next to a map given `agentId`.
- **A brief with an AGENT CONTEXT block** fixes the fields the agent reads, and `mapArea` is not
  one of them. Build those fields in the `context` prop. It is never a reason to hand-roll the
  tools.
- **A boundary or polygon field in the context is `areaGeoJSON(area)`.** `area` is a `MapArea`
  whose outline lives in `area.shape`; never cast it to a shape of your own (an app that read
  `area.points` told its agent no area was ever drawn).
- **The screen's own panels follow the map.** A summary or detail panel beside it is fed from
  `onSelectionChange`, or it sits on "nothing selected" while an area is drawn.
- **Draw modes, vertex handles, a containment test or a selection panel in PLAN.md or the brief
  are this component**, never a second set beside it, even when the brief names its own toolbar
  buttons or lasso/box tools. Its toolbar takes the top of the map and its panel the end edge, so
  the screen's own overlays go elsewhere.

**Read next:**

- `references/copilot.md` — before wiring `agentId`, `chat` or `context`.
- `references/props-and-layout.md` — the other props, the edges it owns, its keys, and scale.
- `examples/StoreMap.tsx` — a whole screen to copy and adapt.
