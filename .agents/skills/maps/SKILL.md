---
name: maps
description: MANDATORY for any map screen — locator, fleet tracking, territory, pins from lat/lng, route, geofence — on Leaflet (the default) or on `mapbox-gl`/`maplibre-gl`. Carries the seven Leaflet defaults that are silently wrong, the basemap table, the visual-design pass, the live-map rules for anything that moves, the pin and cluster traps, the Mapbox/MapLibre marker trap that walks pins off their coordinates, and the pointer to `map-actions` (the prebuilt `<MapAreaTools>`) for drawing an area and asking about it. NOT for charts — those are recharts.
version: 26
---

# Leaflet maps

The template ships **no map library**. Add it once, at the app root:

```bash
bun add leaflet react-leaflet
bun add -d @types/leaflet      # leaflet ships no types; react-leaflet brings its own
```

`react-leaflet@5` is the React 19 line and the template is on React 19 — v4 will not mount
here. Seven packages, ~1s against a warm cache, so this is a cheap dependency; there is no
reason to hand-roll a map out of an SVG or an `<iframe>` instead.

**Charts are not maps.** `recharts` is already in the template and owns every bar, line,
pie and area. Reach for Leaflet only when the thing on screen is geography.

## When the app is on Mapbox GL or MapLibre GL instead

Leaflet is the default; a ported reference or a user-supplied key can land the app here. The
Leaflet sections below do not apply.

**Put data points on a GeoJSON source as `circle` and `symbol` layers**, styled by expressions
(`['get', 'color']`). The library places them, so they cannot drift. Porting a reference that
already does this? Keep its layers — rewriting them as DOM markers is what opens the trap below.

**A `Marker`'s element belongs to the library.** Its stylesheet pins the element with
`position: absolute; top: 0; left: 0`, then rewrites `transform` on it every frame. Anything you
set that competes — `position`, `transform`, `top`, `left`, `margin`, or a `transition` on `all`
or `transform` — moves the marker off its coordinate. An inline `position: relative` is the worst
of them: each marker falls into normal flow below the last, so the 40th sat 1,014px from its
point on mapbox-gl 1.13. The gap is measured in pixels, not metres — invisible at street level,
thousands of miles at country level.

So give that element nothing. Size, colour and animation go on a child, and the stylesheet
(`mapbox-gl/dist/mapbox-gl.css` or `maplibre-gl/dist/maplibre-gl.css`) has to be imported, or
the element is never pinned and they stack anyway.

```ts
const el = document.createElement('div')     // the library's: no position, transform, transition
const ring = document.createElement('div')   // yours: size, border, colour, pulse
el.appendChild(ring)
new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)
```

**Three more traps leave the map blank or empty:**
- Size the map element `h-full w-full`, never `absolute inset-0`: their CSS forces
  `position: relative`, leaving it 0px tall.
- Paint colours must be hex or `rgb()`; theme tokens (`oklch()`, `var(--…)`) break the whole style.
  Convert a token by reading it back from a 1px canvas.
- MapLibre 6+: `import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'` and call
  `setWorkerUrl(workerUrl)`, or the worker 404s and GeoJSON layers stay empty.

### Mark an area and ask about it — the prebuilt `<MapAreaTools>`

When users draw, select or lasso a REGION of the points and ask an AI agent about it: import
`<MapAreaTools>` from `@/components/map/MapAreaTools` instead of hand-rolling drawing tools. It
needs the agent (`agentId` or `chat`); with no agent, hand-roll the drawing and selection.
**`invoke_skill(name="map-actions")` before wiring it.**

## The seven defaults that are wrong

Every one of these is silent. The build stays green and the screen looks broken.

### 1. The container has no height

Leaflet measures its container, and a container with no height measures zero. `h-full`
inside a parent that never established a height is the single most common "the map did not
render" report.

Give the map a parent with a real height, and make every flex ancestor shrinkable:

```tsx
<main className="flex h-screen flex-col">
  <div className="flex min-h-0 flex-1">        {/* min-h-0 or the child refuses to shrink */}
    <aside className="w-80 shrink-0 overflow-y-auto">…</aside>
    <div className="min-h-0 flex-1">
      <StoreMap … />                            {/* MapContainer is h-full w-full inside */}
    </div>
  </div>
</main>
```

### 2. The default marker icons 404

Leaflet resolves its marker images at runtime from a guessed script path. Under Vite that
path does not exist, so markers render as nothing at all. Import the three assets and hand
them to Leaflet — one module, imported once before the first map mounts:

```ts
// src/components/map/leaflet-setup.ts
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })
```

All three are under 4KB, so Vite inlines them as `data:` URIs rather than emitting files.
That is fine — the platform's default `img-src` carries `data:` — but it is why you will
not find them in `dist/assets`.

**Using `divIcon` does NOT exempt you.** The test is the code, not the intent: if a single
`<Marker>` anywhere in the app lacks an explicit `icon` prop, it falls back to the default
icon and renders as nothing. An app that styles most pins with `divIcon` and leaves one bare
`<Marker>` — a "you are here", a selected-result pin, a dock — has an invisible marker and a
green build. Either give EVERY marker an explicit icon, or ship this module; doing both is
cheap and the safe default.

### 3. Leaflet's panes ignore the theme

Leaflet paints into its own panes with hard-coded colours, outside the Tailwind token
system, so in dark mode the popup, the zoom control and the attribution stay white and the
tiles stay a bright daylight map. Ship this next to the map component and import it once:

```css
/* src/components/map/map.css */
.leaflet-container { background: var(--muted); font-family: inherit; }

/* LAST RESORT for a provider with no dark style. Prefer a dark BASEMAP (see the table
   below): this filter inverts the LABELS along with the ground, so place names come out
   as low-contrast mush — it destroys the legibility a street map was chosen for. */
.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9); }

.dark .leaflet-popup-content-wrapper,
.dark .leaflet-popup-tip,
.dark .leaflet-bar a,
.dark .leaflet-control-attribution {
  background: var(--popover);
  color: var(--popover-foreground);
}
.dark .leaflet-bar a { border-color: var(--border); }
.leaflet-control-attribution a { color: var(--primary); }

/* divIcon markup is usually a <span>, and a span is INLINE: width and height are ignored.
   A 22px pin then paints as a 4x19px sliver — "opening a cluster shows nothing", and the
   pin is nearly impossible to click. Copy this rule EXACTLY: both wrappers are load-bearing.
   :where() is zero specificity, so your own classes (a cluster's `display: grid`) win;
   @layer base loses to Tailwind's utilities, which an unlayered rule would beat. Drop either
   and the rule overrides your pin's own layout — its label slides to the top-left corner.
   (Apps created from the current template already carry it in index.css; keep it here too.) */
@layer base { :where(.leaflet-marker-icon > *) { display: block; } }
```

Also give the map container `z-0`. Leaflet's panes and controls sit at `z-index` 400-1000,
which is above most in-page chrome; keeping the map in its own stacking context stops it
painting over a sticky header or a card that overlaps it.

### 4. A resized container keeps drawing at the old size

Leaflet measures once, on mount. A sidebar opening, a tab becoming visible, or the preview
pane being dragged leaves the map drawing at its old size with tiles missing down one edge.
A `ResizeObserver` on the container is the only form of this that covers every cause:

```tsx
function ResizeSync() {
  const map = useMap()
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}
```

`useMap` is only valid **below** `<MapContainer>`. Anything imperative — panning to a
selection, fitting bounds, opening a popup — belongs in a child component like this one,
never in the component that renders `MapContainer`.

### 5. A track is CLIPPED while the map is moving

Only for a map where something MOVES and draws a track (fleet, delivery, replay). A trail behind a
moving marker is cut off at the viewport edge while the map pans, because the vector renderer
re-clips only on `moveend`. The fix is `renderer={L.svg({ padding: 1 })}`; the measurements, the
cost of padding and the canvas trap are in `references/live-maps.md`. A static map skips this.

### 6. A `flyTo` in a HIDDEN document never lands — and the preview iframe is always hidden

The report is *"the tiles glitch when I switch away and then it flies somewhere."* It is not the
tile server.

`flyTo` animates itself on `requestAnimationFrame` — `this._flyToFrame = requestAnimFrame(frame,
this)` in Leaflet's source. **Browsers do not fire rAF in a hidden document.** Switch tabs mid
flight and the loop simply stops: `movestart` has fired, `moveend` has NOT, the map pane keeps a
half-applied transform, and `GridLayer._update` — bound to `move`, since `updateWhenIdle`
defaults to `Browser.mobile` (false on desktop) — stops requesting tiles. Come back and you are
looking at the old zoom's tiles, scaled and offset against a pane mid-transform. That is the
glitch. The §5 renderer clip (`references/live-maps.md`) is stuck too, because it only recomputes on the `moveend` that
never came.

**On this platform it is not an edge case.** The code-app PREVIEW IFRAME reports
`visibilityState: 'hidden'` for its whole life, so rAF never fires there at all — every animated
`flyTo` in a preview is broken, not just the ones interrupted by a tab switch. Build a
selection-flies-to-pin screen, watch it work on the dev server, and it will be broken in the
builder's own preview pane.

Branch on visibility, and cancel any flight still in the air before starting another:

```tsx
function FlyToSelected({ site }: { site: Site | null }) {
  const map = useMap()
  useEffect(() => {
    if (!site) return
    const target: [number, number] = [site.lat, site.lng]
    const zoom = Math.max(map.getZoom(), 14)

    if (document.visibilityState === 'hidden') {
      map.setView(target, zoom, { animate: false })   // lands instantly, no rAF needed
      return
    }
    map.stop()                                        // kill the previous flight first
    map.flyTo(target, zoom, { duration: 0.8 })
  }, [map, site])
  return null
}
```

`map.stop()` is the documented cancel — it reaches `_stop()`, which calls
`cancelAnimFrame(this._flyToFrame)`. Without it, clicking two list rows quickly leaves two
flights competing and the map jitters between them.

Then repair the state when the document comes back:

```tsx
useEffect(() => {
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    map.stop()            // drop a flight that was frozen mid-animation
    map.invalidateSize()  // the ResizeObserver does NOT fire — the size never changed
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => document.removeEventListener('visibilitychange', onVisibility)
}, [map])
```

The `invalidateSize()` matters because the §4 `ResizeObserver` cannot help here: the container's
size never changed, only its visibility, so nothing triggers a remeasure and the stale pixel
origin persists.

### 7. The opening view is a guess, and the data does not fit in it

`<MapContainer center={…} zoom={…}>` makes you name a centre and a zoom before you have seen
the data, so the default path is to hardcode a city centre and `zoom={12}` and hope. It does
not fit. Measured on a generated store-locator: **1 of 18 pins on screen, 17 off**, because the
sites spanned 48x37 km and the hardcoded view covered a fraction of it. The app looked broken on
first paint and there was nothing in the console.

This is the single most-ignored rule in this skill: across three apps generated from it,
`fitBounds` and `latLngBounds` appeared **zero times**. Keep `center`/`zoom` as the pre-data
placeholder they are, and fit as soon as you have points:

```tsx
function FitToData({ points, panelWidth }: { points: LatLngTuple[]; panelWidth: number }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [panelWidth + 32, 40],   // pad for the panel COVERING the map
      paddingBottomRight: [40, 60],
    })
  }, [map, points, panelWidth])
  return null
}
```

**Pad for your own chrome.** A floating panel sits *over* the map, so symmetric padding centres
the data underneath it. `paddingTopLeft`/`paddingBottomRight` are the asymmetric form.

**Do not let a default selection fight the fit.** The same app wrote
`sites.find(...) ?? sites[0]`, so a site was *always* selected, so the fly-to-selection effect
fired on mount and overrode the overview before the user saw it. If you auto-select for the
detail panel, either select without flying, or fit first and fly only on a real user choice.

### The renderer decides whether `var()` works

`pathOptions={{ color: 'var(--primary)' }}` works **on SVG only**, which is the default. Leaflet
writes the value as a presentation attribute, the browser resolves the custom property, and the
stroke computes to the real token — measured `oklch(0.922 0 0)` from `var(--primary)`.

The canvas renderer assigns the same string to `ctx.strokeStyle`. Canvas has no access to the
CSS cascade, `var(--primary)` is not a valid colour there, and the assignment is **ignored** —
so the shape is drawn in the canvas default, **black**. No console warning. A two-line route
casing collapses into one thick black stroke, and on a dark basemap it looks like the route
simply vanished.

So a "near-black" path has two causes, not one: the app has no theme applied, **or** you are on
canvas with a `var()` colour. If you need canvas, resolve the token to a real colour first:

```ts
const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

<Polyline pathOptions={{ color: token('--primary') }} />   // 'oklch(0.922 0 0)' — canvas-safe
```

Read it inside an effect, not at module scope — at module scope the stylesheet may not have
applied yet — and re-read it when the theme flips, or the canvas keeps the old theme's colours.

Canvas also doubles its backing store on a retina display: `padding: 1` on that 1200x670 map
produced a **7200x4020** canvas. That is the real cost of generous padding on canvas.

## Choose the basemap — it is a design decision, not a default

The tile URL is the single biggest lever on how a map app looks, and it is one line. **Pick
one deliberately per app**; do not paste the street map into everything. Two apps built from
this skill that both ship the standard OSM base look like the same app.

**HARD RULE: the basemap must be KEYLESS. Pick from the table below and nowhere else.** A
generated app has no account anywhere and no key to put in `.env`, so a keyed provider does
not degrade — it ships a broken or watermarked map to the user. Never reach for CARTO
(`basemaps.cartocdn.com` — Positron, Dark Matter, Voyager), Mapbox, Stadia, Thunderforest or
MapTiler, however well they fit the design; they are the ones the model reaches for by habit
and every one of them needs a key. If you believe the design needs a style no keyless row
offers, use the closest keyless row and SAY SO in your reply — do not substitute a keyed host
and do not invent an `import.meta.env.VITE_*_KEY` for a key nobody set. The only exception is
a key the USER supplied in this conversation.

| Use it for | URL template |
|---|---|
| General / consumer locators | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| Denser labels, European styling | `https://tile.openstreetmap.de/{z}/{x}/{y}.png` |
| Field ops, terrain, logistics, anything outdoors | `https://tile.opentopomap.org/{z}/{x}/{y}.png` |
| Transit / public-transport apps | `https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png` |
| Satellite imagery | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` |
| **Dark UI, data-heavy dashboards** | `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}` |
| Muted light base under bright data | `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}` |

All seven need no API key and were verified serving tiles. **Esri's path is `{z}/{y}/{x}`** —
y before x, unlike every other row; copy it exactly. Pair imagery with a labels overlay as a
second `<TileLayer>` if roads need naming:
`https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`.

**That Esri host carries a whole family, all keyless and all on the same `{z}/{y}/{x}` path** —
swap the service name in the URL. Verified serving: `World_Street_Map`, `World_Topo_Map`,
`World_Terrain_Base`, `World_Shaded_Relief`, `NatGeo_World_Map`, `Ocean/World_Ocean_Base`,
`Elevation/World_Hillshade`. Reach for one of these before concluding a style is unavailable
without a key.

Each provider needs its own attribution — Esri imagery is `Tiles &copy; Esri`, OpenTopoMap
adds `&copy; OpenTopoMap (CC-BY-SA)` after the OSM credit.

**Every provider stops at a different zoom, and running past it fails SILENTLY.** Esri does
not 404 — it returns a grey tile reading "Map data not yet available" with HTTP 200, so the
map just goes blank with nothing in the console. Measured over Bengaluru: `World_Imagery`
has real tiles to **z19**, `Canvas/World_Dark_Gray_Base` only to **z16**, and past those
every request returns an identical 2521-byte placeholder (a useful signature when checking
a new provider).

Set **`maxNativeZoom`** to the provider's real limit and leave `maxZoom` at what the user
may zoom to. Leaflet then upscales the deepest real tiles instead of requesting ones that do
not exist — slightly soft, but a continuous map:

```tsx
<TileLayer url={ESRI_DARK} attribution={ESRI_ATTRIBUTION} maxNativeZoom={16} maxZoom={19} />
```

Lowering `maxZoom` to 16 instead is the wrong fix: it silently takes zoom away from the user
on an app whose whole point may be inspecting one pin.

**Two useful styles cannot satisfy the literal-host rule below**, because they 404 without a
subdomain — Humanitarian (`https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`) and CyclOSM
(`https://a.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png`). They render, because
`img-src` is permissive, but their origin is never granted. Use them only when the style is
worth that, and say so to the user.

**A dark app should use a DARK BASEMAP, not the filter.** `Canvas/World_Dark_Gray_Base` above
is genuinely dark cartography and needs no key, so prefer it over inverting a light map: the
`filter` in §3 also inverts the LABELS, which is what makes filtered dark maps look subtly
wrong. Keep the filter only for a provider that ships no dark style (plain OSM, OpenTopoMap).

CARTO's Positron, Dark Matter and Voyager — the styles usually reached for here, and banned by
the hard rule above — **require a free API key**, and the way they tell you is a trap worth
knowing by name. This is the failure users actually report: *"an API key required thing is
showing on the map."*

**`basemaps.cartocdn.com` answers an unkeyed request with HTTP 200, a valid PNG, a plausible
byte count, and `Access-Control-Allow-Origin: *`.** Every check short of looking at the image
passes. The tile itself carries `API KEY REQUIRED / carto.com/basemaps/apikey` diagonally
across it, so the app ships a map wearing a watermark and the console says nothing. A `curl -I`
sweep, or one that diffs `%{size_download}`, will call this provider verified. It is not.

**So: verify a new tile provider by LOOKING at a tile, never by its status code.** Save one to
disk and open it. This is the same class of failure as Esri's grey "Map data not yet available"
placeholder above, except Esri's is a constant 2521 bytes and CARTO's is not, so byte-size
signatures do not catch it either.

A keyed provider is a fine choice when the user supplies the key (it goes in `.env` and the key
rides in the query string, never in the host — see the CSP rule below). It is simply not needed
to get a dark map or a label split.

**The label split you actually want is keyless, and it is Esri Canvas.** Each Canvas family
ships as two services — `..._Base` is the ground with no text, `..._Reference` is a transparent
PNG carrying only the place names — which is exactly the separation the three-layer stack below
needs, with no key and no watermark:

| | ground, no text | labels only, transparent |
|---|---|---|
| dark | `Canvas/World_Dark_Gray_Base` | `Canvas/World_Dark_Gray_Reference` |
| light | `Canvas/World_Light_Gray_Base` | `Canvas/World_Light_Gray_Reference` |

Both pairs verified by eye at z12 over Bengaluru: the Base tile is dark-grey cartography with
roads and no text, the Reference tile is transparent with "Bengaluru / Bangalore" and nothing
else. Same `{z}/{y}/{x}` path as every other Esri row, same `maxNativeZoom={16}` ceiling.

## Tiles, and the CSP rule that goes with them

Write the tile URL as **one plain literal with no `{s}` subdomain placeholder**:

```ts
// src/components/map/tiles.ts — every host a plain literal, so every origin gets granted
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

// Esri Canvas ships each family as a Base (ground, no text) + Reference (labels only,
// transparent) pair — the keyless label split the three-layer stack needs. Note {z}/{y}/{x}.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
export const ESRI_DARK_BASE   = `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`
export const ESRI_DARK_LABELS = `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`
export const ESRI_LIGHT_BASE  = `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`
export const ESRI_LIGHT_LABELS= `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`
export const ESRI_ATTRIBUTION = 'Tiles &copy; Esri'
```

The `${ESRI}` prefix is fine — the HOST is still a plain literal in the source, which is all the
scanner reads. One host covers every Esri row, so the whole family costs a single CSP grant.

After a green build the engine scans `src/**` for `https://` literals and grants the
origins it finds to the app's CSP, then carries them onto the interface record at publish.
**A host containing `{`, `}`, `$`, `*`, `<`, `>` or a space is dropped** — it reads as an
unresolved template. So the classic `https://{s}.tile.openstreetmap.org/…` form never
becomes a grant. Braces in the *path* (`{z}/{x}/{y}`, `{r}`) are fine; only the host
matters. OpenStreetMap deprecated the subdomain form anyway.

Raster tiles happen to survive that mistake today, because the platform's default
`img-src` is `*`. **Fetches do not.** `connect-src` is an explicit allowlist with no
wildcard, so anything the map loads over XHR — geocoding, routing, a GeoJSON boundary
file, an Overpass query, a vector-tile style document — is blocked unless its origin was
granted, and it is granted only if you wrote it as a plain literal:

```ts
// granted: the host is a plain literal
const GEOCODE = 'https://nominatim.openstreetmap.org/search'

// granted: host still literal, the interpolation is in the PATH
const url = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`

// NOT granted: the host itself is assembled
const url = `https://${provider}.tiles.example.com/{z}/{x}/{y}.png`
```

(A key, on the rare occasion the user supplied one, rides in the query string the same way
and the host stays literal. Do not write such a URL on your own initiative — see the hard
rule above.)

This is also why raster tiles beat vector tiles here: raster goes through `img-src` and
just works, vector fetches its style and tiles through `connect-src` and does not until
the origin is granted.

When the build report says an origin was added, **say so in your reply** — which origin and
what it is for.
<solution:omit>
Add that the owner can remove it in Interface settings → CSP Manager.
</solution:omit>
See the `content-security-policy` skill; a map app will trigger this on almost every first
build.

**OpenStreetMap's own tile server is for development and light use.** Its tile usage
policy forbids heavy or commercial traffic. Ship on it (or on an Esri Canvas row, which has
no such restriction) and TELL the user that at real traffic they should move to a provider
they hold an account with — MapTiler, CARTO, Stadia — which is a URL swap and a key in
`.env`, not a rewrite. That is a note for them to action, not a reason to wire a keyed
provider into the app now.

## A complete map component

```tsx
import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'                  // required, or the tiles tile wrongly
import '@/components/map/leaflet-setup'
import { OSM_ATTRIBUTION, OSM_TILES } from '@/components/map/tiles'

export function StoreMap({ stores, selected, onSelect }: StoreMapProps) {
  return (
    <MapContainer center={[12.9716, 77.5946]} zoom={12} scrollWheelZoom className="h-full w-full z-0">
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
      <ResizeSync />
      <PanTo store={selected} />
      {stores.map((store) => (
        <Marker
          key={store.id}
          position={[store.lat, store.lng]}
          eventHandlers={{ click: () => onSelect(store) }}
        >
          <Popup>{store.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

function PanTo({ store }: { store: Store | null }) {
  const map = useMap()
  useEffect(() => {
    if (store) map.flyTo([store.lat, store.lng], Math.max(map.getZoom(), 14))
  }, [map, store])
  return null
}
```

`attribution` is not decoration — OpenStreetMap's licence requires the credit, and
`maxZoom={19}` matches what OSM actually serves (ask for 20 and the top zoom is blank).

## Make it look designed, not default

A map that works still announces itself as stock Leaflet. Five defaults are the tell, and each
is one line to remove:

| The tell | The fix |
|---|---|
| The blue teardrop pin | `divIcon` — see *Pins* below |
| The `+`/`-` bar welded to the top-left | `<MapContainer zoomControl={false}>`, then place your own |
| The white popup with the close `X` and the tip | a side panel; or `closeButton={false}` + a class |
| `Leaflet \| &copy; OpenStreetMap` in the corner | `<AttributionControl prefix={false} />` |
| A full-saturation street basemap under coloured data | a `_nolabels` quiet base |

Work down that list before adding anything. A map is mostly other people's pixels, so the few
you control — the base, the pins, the panels — carry the whole impression.

### The three-layer stack: quiet base, your data, labels on top

The default arrangement paints place names into the basemap, so any filled polygon or thick
route buries them and the map turns into a coloured blob with roads under it. Real cartography
puts the labels back on top. Leaflet does this with one extra pane:

```tsx
import { MapContainer, Pane, TileLayer, GeoJSON, Polyline, Marker } from 'react-leaflet'

<MapContainer center={[12.9716, 77.5946]} zoom={12} zoomControl={false}
              attributionControl={false} className="h-full w-full z-0">
  {/* 1. ground, no text                                        tilePane     200 */}
  <TileLayer url={ESRI_DARK_BASE} maxNativeZoom={16} maxZoom={19} />

  {/* 2. your data                                              overlayPane  400 */}
  <GeoJSON data={territories} style={territoryStyle} />
  <Polyline positions={route} pathOptions={routeCore} />

  {/* 3. place names, back on top of the data                   labels       450 */}
  <Pane name="labels" style={{ zIndex: 450, pointerEvents: 'none' }}>
    <TileLayer url={ESRI_DARK_LABELS} attribution={ESRI_ATTRIBUTION}
               maxNativeZoom={16} maxZoom={19} />
  </Pane>

  {/* 4. pins stay above the labels                             markerPane   600 */}
  {sites.map((s) => <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon(s.status, s.id === selectedId)} />)}
</MapContainer>
```

`<Pane>` is a real react-leaflet export — it creates the pane and mounts its children into it,
so you never need `map.createPane` in an effect and never hit the ordering bug where a
`pane="labels"` layer mounts before the pane exists.

**450 is the number**, and it is not arbitrary. Leaflet's stock panes are `tilePane` 200,
`overlayPane` 400, `shadowPane` 500, `markerPane` 600, `tooltipPane` 650, `popupPane` 700.
Slotting labels at 450 puts them above your shapes and below your pins — which is what you
want, because a place name should survive a choropleth but must not cover a clickable pin.

**`pointerEvents: 'none'` is not optional.** Without it the labels pane is a transparent sheet
over the whole map and it eats every click on the polygons underneath. The symptom is a
choropleth whose regions stopped being selectable, with nothing in the console.

### Pins: a dot with a knockout ring, not a teardrop

Safe here because `divIcon` nests `.pin` inside a wrapper Leaflet owns and transforms. Mapbox
has no wrapper, so the same `transform`/`transition` lands on the positioned element and the
pin drifts — see the Mapbox section above before reusing this there.

```tsx
// ONE icon object per look, built once and reused. react-leaflet compares `icon` BY REFERENCE,
// and a new object makes Leaflet destroy and rebuild that pin's DOM — build icons in render
// and every hover, selection or re-render redraws all ~400 pins and restarts their transitions.
const pinCache = new Map<string, L.DivIcon>()
const pinIcon = (variant: string, selected = false) => {
  const key = `${variant}:${selected}`
  let icon = pinCache.get(key)
  if (!icon) {
    const size = selected ? 26 : 16
    icon = L.divIcon({
      className: '',                                // '' or the wrapper keeps stock styling too
      html: `<span class="pin pin--${variant}${selected ? ' pin--selected' : ''}"></span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],             // a circle's centre is its point
    })
    pinCache.set(key, icon)
  }
  return icon
}
```

```css
.pin {
  display: block; width: 100%; height: 100%; border-radius: 9999px;
  background: var(--primary);
  /* the knockout ring is what keeps a pin legible on BOTH a pale and a dark base */
  box-shadow: 0 0 0 2px var(--background), 0 1px 4px rgb(0 0 0 / 0.4);
  transition: transform 0.15s ease;
}
.pin:hover { transform: scale(1.25); }
.pin--critical { background: var(--destructive); }
.pin--selected {
  box-shadow: 0 0 0 3px var(--background),
              0 0 0 9px color-mix(in srgb, var(--primary), transparent 78%);
}
```

- **A circle outperforms a teardrop at density.** Teardrops overlap into a smear; a dot with a
  ring stays countable. Keep the teardrop only when the exact point matters more than the set
  — a single "you are here", a drop-off.
- **`iconAnchor` is half of `iconSize` for a circle** (the centre is the point) and the full
  height for a teardrop (the tip is the point). Get this wrong and every pin sits north of its
  own coordinate, which looks like bad data rather than bad CSS. Mapbox takes a NAMED `anchor`
  (`'center'`, `'bottom'`) instead, so a pixel pair carried across is not read.
- **Size is your hierarchy; colour is your category.** Encoding importance in both leaves you
  no room to show state.
- **Scale on hover in CSS, never by swapping the icon.** Swapping rebuilds the DOM node, so the
  transition never runs and the pin snaps.
- **Never call `L.divIcon` inside render or `.map()`.** Go through a cache keyed on what the pin
  LOOKS like (variant + selected), as above — so a selection change rebuilds two pins, not all
  of them. The same rule, for pins that animate, is in `references/live-maps.md`.

### Routes: draw the line twice

A single stroke vanishes wherever it crosses a road of the same value. Every transit map in the
world solves this with a casing — a wider, darker line underneath:

```tsx
<Polyline positions={route} pathOptions={{ color: 'var(--background)', weight: 8, opacity: 0.9 }} />
<Polyline positions={route} pathOptions={{ color: 'var(--primary)', weight: 4, lineCap: 'round' }} />
```

Order matters: casing first, core second. Two lines of code and it is the difference between a
route that sits *on* the map and one that gets lost *in* it.

### Popups are a last resort

A Leaflet popup is ~200px wide, pans the map out from under the user when it opens, and arrives
wearing stock chrome. Anything rich — an image, a price, a CTA — belongs in a side panel or a
bottom sheet driven off selection state, with the map flying to the pin. Use `<Tooltip>` for a
name on hover and the panel for everything else.

If a popup is genuinely right, strip it:

```tsx
<Popup closeButton={false} className="app-popup" offset={[0, -12]} />
```

```css
.app-popup .leaflet-popup-content-wrapper {
  background: var(--popover); color: var(--popover-foreground);
  border-radius: var(--radius); box-shadow: 0 8px 24px rgb(0 0 0 / 0.25); padding: 0;
}
.app-popup .leaflet-popup-content { margin: 0; width: auto !important; }
.app-popup .leaflet-popup-tip { background: var(--popover); }
.app-popup .leaflet-popup-tip-container { display: none; }   /* drop the speech-bubble arrow */
```

`width: auto !important` earns its `!important` — Leaflet measures the popup and then writes an
inline pixel width, so the card cannot size to its own content without overriding it.

### Controls and attribution

```tsx
<MapContainer zoomControl={false} attributionControl={false} …>
  <ZoomControl position="bottomright" />
  <AttributionControl position="bottomright" prefix={false} />
```

`prefix={false}` removes Leaflet's self-credit — which is optional — and **not** the data
credit, which is not. OSM's licence and CARTO's terms both require the attribution string to
stay visible; keep passing it on the `TileLayer`.

```css
.leaflet-control-attribution {
  background: color-mix(in srgb, var(--background), transparent 25%);
  font-size: 10px; color: var(--muted-foreground);
}
.leaflet-bar a { background: var(--background); color: var(--foreground); border-color: var(--border); }
```

Move the controls to whichever corner your floating panels do not occupy — the default top-left
is almost always where the sidebar or the search box wants to be.

### Layout: the map is the ground, not a widget

A map inside a bordered card next to a chart reads as a dashboard tile. A map filling the
viewport with controls floating over it reads as a map product. When the map is the point of the
screen, build the second one:

```tsx
<div className="relative h-screen w-full">
  <div className="absolute inset-0 z-0">                       {/* the wrapper is absolute… */}
    <StoreMap … />                                              {/* …the map element is h-full w-full */}
  </div>
  <div className="pointer-events-none absolute inset-0 p-4">    {/* overlay, clicks pass through */}
    <aside className="pointer-events-auto w-80 rounded-xl border bg-background/80 p-4
                      shadow-lg backdrop-blur">
      …
    </aside>
  </div>
</div>
```

- **The `pointer-events-none` wrapper with `pointer-events-auto` children is the whole trick.**
  Without it the overlay is an invisible sheet and the map stops dragging everywhere the
  overlay reaches, which is everywhere.
- **Floating panels need a real surface** — `bg-background/80 backdrop-blur border shadow-lg` —
  or they dissolve into the map. On satellite imagery, drop the transparency entirely.
- **Scrim busy edges.** Over imagery, a `pointer-events-none` gradient strip
  (`bg-gradient-to-r from-background/70 to-transparent`) behind a panel keeps text readable
  wherever the ground happens to go bright.
- Keep the map at `z-0` (§3 above) so its panes cannot paint over the panels.

### Motion

- `map.flyTo(latlng, zoom, { duration: 0.8 })` on selection. `setView` is instant and reads as a
  page swap; the flight is what tells the user the pin and the list row are the same thing.
- `map.fitBounds(bounds, { paddingTopLeft: [360, 40], paddingBottomRight: [40, 40] })` — pad for
  the panel that is covering the map, or half your data centres itself underneath it.
- Do not run CSS transitions on hundreds of `divIcon`s during a drag; transition the hovered pin
  only.

### Pick a direction, or every app looks the same

| Direction | Base | Data accent | Chrome |
|---|---|---|---|
| **Editorial light** — directories, listings, marketplaces | Esri `Canvas/World_Light_Gray_Base` + Reference | one saturated accent, everything else neutral | white panels, hairline borders, generous padding |
| **Ops console** — dispatch, fleet, monitoring | Esri `Canvas/World_Dark_Gray_Base` + Reference pane | status palette (ok / warn / critical), thin bright routes | dark translucent panels, tabular numerals, dense |
| **Satellite hero** — property, travel, field survey | Esri `World_Imagery` + `Reference/World_Transportation` overlay | white high-contrast pins, strong knockout rings | opaque panels and a scrim; imagery eats text |

This is the same failure as the basemap default one level up: two apps built off this skill that
both ship stock pins on stock OSM tiles look like the same app. Choose a row deliberately and
say which one you chose in your reply.

## Live maps: things that actually move

Tracking, delivery in flight, replay, a simulation: read `references/live-maps.md` before
building one. Its three rules, one line each: build every `divIcon` once per visual state (a new
icon object makes Leaflet destroy and rebuild the pin's DOM, restarting its CSS animation every
tick); cap the trail; and advance the simulation by real elapsed time, because the preview is a
hidden document where `requestAnimationFrame` never fires and `setInterval` crawls.

## Drawing a radius, and counting what falls inside it

"Draw a circle, tell me how many pins it caught" is a common ask (catchment analysis, service
radius, coverage planning). **It needs no drawing plugin and no geo library.** (This section is
Leaflet. To draw an area and ask about it, use `map-actions`.)

Do NOT reach for `react-leaflet-draw` — it wraps Leaflet.draw, which is unmaintained. If an
app genuinely needs full shape editing (polygons, vertex dragging, rectangles), use
`@geoman-io/leaflet-geoman-free`, which is maintained. For circles, two clicks is less code
than either.

**The whole point-in-radius test is `map.distance(a, b)`** — metres between two points via the
map's CRS. Verified against an independent haversine on 200 points: identical counts.

```tsx
function DrawLayer({ pins, zones, onCommit }: DrawLayerProps) {
  const [pending, setPending] = useState<LatLng | null>(null)

  // useMapEvents binds map handlers; like useMap it is only valid inside MapContainer.
  const map = useMapEvents({
    click(e) {
      if (!pending) return setPending(e.latlng)              // 1st click drops the centre
      const radius = map.distance(pending, e.latlng)         // 2nd click fixes the radius
      if (radius > 0) onCommit({ id: crypto.randomUUID(), centre: pending, radius })
      setPending(null)
    },
    mousemove(e) { if (pending) setPreview(map.distance(pending, e.latlng)) },
  })
  …
}

const inside = pins.filter((p) => map.distance(zone.centre, [p.lat, p.lng]) <= zone.radius)
```

Three things that are easy to get wrong:

- **Overlapping circles double-count.** A pin inside two zones is still one pin, so the
  headline total must be a union — `new Set(zones.flatMap(z => hits(z).map(p => p.id))).size`
  — while each zone still shows its own count.
- **Memoize the counting.** It is O(zones x pins) and re-runs on every render otherwise;
  `useMemo` on `[zones, pins]` is enough at the thousands scale.
- **Render a live preview circle** between the two clicks (dashed, from the pending centre to
  the cursor) or the interaction feels broken — the user gets no feedback that the first click
  registered.

`pathOptions={{ color: 'var(--primary)' }}` works **on the default SVG renderer** — Leaflet
writes it as a presentation attribute and `var()` resolves there. It does NOT work on
`L.canvas()`, which draws the shape black instead; see *The renderer decides whether `var()`
works* above before changing renderers.

## Beyond markers

- **Many STATIC points** (roughly 50 to ~20,000 — past that, the `performance` skill):
  `bun add react-leaflet-cluster` — pin `^4.1.3`, the line that supports react-leaflet 5 and
  React 19. Wrap the markers in `<MarkerClusterGroup>` and they group by zoom. Leaflet keeps a
  DOM node per marker, so a few thousand loose markers stutter.

  **Do not cluster markers that MOVE.** The threshold above is for pins that sit still. A
  cluster layer re-partitions its children whenever they move, so animating positions through
  one thrashes continuously and looks worse than no clustering at all. For live tracking or
  replay, draw the moving objects yourself (see below) and cluster only the static layer —
  docks, depots, sites. At low zoom, thin the trails and de-emphasise the static layer instead
  of grouping the movers.

- **You MUST import the cluster CSS yourself — nothing does it for you.**
  `react-leaflet-cluster` ships two stylesheets and imports neither (no `style` field, no
  `sideEffects`, no import in `dist/index.js`). Skip them and clusters render as raw
  unstyled boxes: square instead of round, the count jammed in the top-left corner, and the
  inner div offset from its outer by 5px — which reads as two misaligned rectangles per
  cluster, not as a bug in your code.

  ```ts
  import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'          // ALWAYS — structure,
                                                                         // animations, spiderfy legs
  import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'  // ONLY for the stock look
  ```

  `MarkerCluster.css` is structural and always required. `MarkerCluster.Default.css` is the
  appearance — it supplies `border-radius`, the 30x30 inner div and the text centring, *and*
  the stock palette. Taking it means taking the look; skipping it means you own the shape.

- **Design the cluster bubble — the default is a signature.** With `Default.css` imported you
  get Leaflet's stock bubbles: `.marker-cluster-small` is `rgba(181, 226, 140, 0.6)` pale
  green, medium amber, large red, in three fixed size buckets that know nothing about the
  app's theme. Left alone it is instantly recognisable as a stock Leaflet map — the same
  "every app looks the same" problem as the basemap. Style it. Either repaint the default
  (quick — keep `Default.css` for the shape and override only the colours):

  ```css
  .marker-cluster { background: color-mix(in srgb, var(--primary), transparent 65%); }
  .marker-cluster div { background: var(--primary); color: var(--primary-foreground); font-weight: 800; }
  ```

  …or take full control with `iconCreateFunction`, which is the one that lets the bubble
  carry MEANING — size by count, colour by the worst state among its children:

  ```tsx
  <MarkerClusterGroup
    showCoverageOnHover={false}          // else hovering draws a convex hull over your design
    iconCreateFunction={(cluster) => {
      const children = cluster.getAllChildMarkers()
      // look the CURRENT state up by id — a marker option is frozen at mount (see below)
      const worst = children.some((m) => severityById.get(m.options.siteId ?? '') === 'critical') ? 'critical' : 'normal'
      const size = 32 + Math.min(16, Math.log2(children.length) * 4)   // count → radius
      return L.divIcon({
        className: '',                    // '' or the wrapper keeps the default styling too
        html: `<span class="cluster cluster--${worst}">${children.length}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2], // omit and the bubble sits off its own position
      })
    }}
  >
  ```

  ```css
  /* The span must be block-level or it has no size — see the map.css rule above. */
  .cluster { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 9999px;
             background: var(--primary); color: var(--primary-foreground); font-weight: 700; }
  .cluster--critical { background: var(--destructive); }
  ```

  Going the `iconCreateFunction` route, import **only** `MarkerCluster.css` and leave
  `Default.css` out — then your `divIcon` owns the shape outright and there is no stock
  specificity to fight.

  **Identify a child marker by an ID option, never by its `title` string.** Leaflet passes
  unknown options straight through, so a `siteId` given to `<Marker>` is readable as
  `m.options.siteId`. react-leaflet's `MarkerProps` rejects a prop it does not know
  (TS2322), so declare it once and both sides type-check:

  ```ts
  declare module 'leaflet' { interface MarkerOptions { siteId?: string } }
  ```

  Matching on `title?.endsWith(', covered')` works until someone rewrites the tooltip copy,
  and then the colours silently stop meaning anything.

  **A marker option is set ONCE, at mount — so put only the ID there, never state.**
  react-leaflet's `Marker` passes its props to `new L.Marker(…)` and afterwards updates only
  `position`, `icon`, `zIndexOffset`, `opacity` and `draggable`. Any other prop — a `severity`,
  a `band` — keeps the value it had when the marker first rendered, silently. So carry the
  record's ID (fixed for the marker's life, and use the same value as its React `key`) and
  look the CURRENT state up by that ID inside `iconCreateFunction`.

- **When the pins are coloured by a value, the clusters must be coloured by it too.** A
  "colour by revenue / growth / risk" switch on a clustered map is invisible at every zoom
  where the stores are grouped — which, for a regional or national network, is the opening
  view and most of the others. A single-colour bubble says "there are 44 stores here" and
  nothing about them. Make the bubble a ring of each colour's share, with the dominant
  colour tinting the centre — the SAME band classes the pins use:

  ```tsx
  const BANDS = ['high', 'mid', 'low', 'none'] as const     // the pins' own colour classes
  type Band = (typeof BANDS)[number]
  declare module 'leaflet' { interface MarkerOptions { siteId?: string } }  // the ID only — see above

  // Structural type on purpose: `L.MarkerCluster` needs @types/leaflet.markercluster, which
  // react-leaflet-cluster does not install, and naming it fails the build with TS2694.
  // `bandById` is built for the CURRENT metric; the marker only says who it is.
  const clusterIcon = (cluster: { getAllChildMarkers(): L.Marker[] }, bandById: Map<string, Band>) => {
    const children = cluster.getAllChildMarkers()
    const count = new Map<Band, number>()
    for (const m of children) {
      const band = bandById.get(m.options.siteId ?? '') ?? 'none'
      count.set(band, (count.get(band) ?? 0) + 1)
    }
    let from = 0
    const ring = BANDS.filter((b) => count.has(b)).map((b) => {
      const to = from + (count.get(b)! / children.length) * 360
      const stop = `var(--band-${b}) ${from}deg ${to}deg`
      from = to
      return stop
    })
    const top = [...count].sort((a, b) => b[1] - a[1])[0][0]
    const size = 36 + Math.min(14, Math.log2(children.length) * 2.5)
    return L.divIcon({
      className: '',
      html: `<span class="cluster cluster--${top}" style="--ring: conic-gradient(${ring.join(', ')})">${children.length}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }
  ```

  ```css
  /* one palette for pins AND clusters; the ring is the mix, the centre the dominant band */
  .leaflet-container { --band-high: var(--chart-2); --band-mid: var(--chart-3); --band-low: var(--chart-1); --band-none: var(--muted-foreground); }
  .cluster--high { --band: var(--band-high); }  /* …one per band, shared with .pin--high etc. */
  .cluster {
    background: radial-gradient(circle closest-side, color-mix(in srgb, var(--band), var(--card) 82%) 0 60%, transparent 62%), var(--ring);
    color: var(--foreground); border: 2px solid var(--card);
  }
  ```

  Put a line in the legend saying what the ring means — nobody guesses it.

  **Clusters do NOT redraw when that colouring changes.** When `iconCreateFunction` changes,
  `react-leaflet-cluster` copies the new function into the group's options and stops there.
  The bubbles already on screen keep the OLD colours until the next zoom, so switching the
  metric recolours the pins beside a cluster that still shows the previous one. Rebuild the
  band map when the metric changes, pass the NEW map into `iconCreateFunction`, and redraw:

  ```tsx
  const bandById = useMemo(() => new Map(sites.map((s) => [s.id, bandOf(s, metric)])), [sites, metric])
  const clusters = useRef<{ refreshClusters(): void }>(null)          // structural, as above
  // In the component that RENDERS <MarkerClusterGroup>: effects run child-first, so the group
  // has already taken the new iconCreateFunction by the time this one fires.
  useEffect(() => { clusters.current?.refreshClusters() }, [bandById])

  <MarkerClusterGroup ref={clusters} iconCreateFunction={(c) => clusterIcon(c, bandById)}>
    {sites.map((s) => (
      <Marker key={s.id} siteId={s.id} position={[s.lat, s.lng]} icon={pinIcon(bandById.get(s.id) ?? 'none')} />
    ))}
  </MarkerClusterGroup>
  ```

  Test it the way it breaks: switch the metric WITHOUT zooming and check a cluster's ring
  changed. A recipe that reads the band off the marker passes every zoom-based check and
  still shows the first metric's colours forever.

- **Animating many markers — draw them, do not re-render them.** A `<Marker>` per moving
  object, re-rendered every frame, is what makes replay and live-tracking screens stutter:
  React reconciles hundreds of components and Leaflet rebuilds their DOM nodes per tick. Draw
  the moving layer onto a canvas overlay instead, on a `requestAnimationFrame` loop, and keep
  the React/Leaflet components for the things that hold still.

  **The trap is that a canvas overlay drifts while the map is dragged.** Leaflet pans by
  translating its map pane; a canvas positioned in screen coordinates stays where it is, so
  the dots and trails slide away from the ground under them and snap back on release. Anchor
  the canvas to the map pane and redraw off Leaflet's own move events — `map.latLngToLayerPoint`
  for positions, not raw pixel offsets — so the overlay moves with the pane rather than against
  it. It looks correct until the first drag, which is why it is worth checking deliberately.

- **Letting the user switch basemaps**: render each option as a `<TileLayer>` inside
  `<LayersControl>` (`<BaseLayer checked>` for the default), or drive one `<TileLayer>` from a
  `url` in state and give it a `key={url}` so React remounts the layer. Both origins get
  granted, since both URLs are literals in source.
- **A custom pin**: `L.divIcon({ html, className, iconSize, iconAnchor })` renders real
  markup, so a pin can use the app's tokens and lucide icons. Set `iconAnchor` or the pin
  floats above its coordinate. Size the markup with `display: block; width: 100%; height:
  100%` so it fills `iconSize` — a bare `<span class="pin">` with `width: 22px` is inline,
  ignores the width, and ships as a sliver (the `map.css` rule above is the safety net, not a
  reason to leave it out).
- **The detail panel beside the map is an `<aside>`, not a Sheet.** Selecting a pin fills a
  persistent side panel on desktop; a `Sheet` is only for narrow screens, and it must not
  open on desktop at all — gate it with `useMediaQuery`, never with `lg:hidden` on
  `SheetContent` (the `best-practices` skill, "Drawers and dialogs", has why: the page blurs
  and freezes behind a panel nobody can see).
- **Shapes**: `<GeoJSON data={…} />` for boundaries, `<Polyline>` for a route,
  `<Circle>` for a radius. Style them from the theme's colours, not hard-coded hex.
- **Fit to the data** instead of guessing a centre and zoom:
  `map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })`.
- **Addresses are not coordinates.** Leaflet plots lat/lng only. Turning an address into
  coordinates is a geocoding call over `connect-src` — see the CSP rule above, and prefer
  storing lat/lng on the record over geocoding on every render.
