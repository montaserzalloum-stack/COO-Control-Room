# Live maps — the rules for anything that MOVES

Read this when something on the map moves: fleet or delivery tracking, a vehicle in flight,
a replay, a simulation, or a trail drawn behind a marker. A static map (stores, sites,
listings, territories) needs none of it. Section numbers (§1–§7) refer to `SKILL.md`.

## A track is CLIPPED while the map is moving (SKILL.md §5)

The report is always the same sentence: *the line cuts off when the vehicle moves.* It is not
your data and not your state — it is Leaflet's renderer clip, and it bites exactly the app that
follows a moving thing.

Every `Polyline`, `Polygon` and `Circle` is drawn by a shared renderer that maintains a clip
area of **`getSize() * (0.5 + padding)`, with `padding` defaulting to `0.1`** — one viewport
plus 10% on each side, and nothing outside it is drawn. Measured on a 1200x717 map: the SVG
comes out 1440x865, a ratio of exactly 1.20.

The clip is recomputed on **`moveend` only** — the renderer's `getEvents()` binds
`moveend: this._update`, and during a `move` the container is merely translated. So while the
map is panning to follow a marker, the trail is still clipped to where the viewport *was*, and
the leading end of the track is visibly cut. Let go and it snaps back to full, which is what
makes it read as a rendering glitch rather than a setting.

Give the renderer room:

```tsx
<MapContainer renderer={L.svg({ padding: 1 })} …>   // clip becomes 3x the viewport
```

Verified: the same map then reports a ratio of exactly 3.00 (`1 + 2 * padding`). `0.5` is
usually enough for a follow-cam; `1` covers a fast one.

**`padding` IS the preload — that is the whole point of it.** The instinct is to ask for
something that redraws the track while the map moves; there is no such option, because the
renderer binds `moveend: this._update` and nothing else. It never re-clips during a move. So
the only way a track can already be there when you arrive is for it to have been drawn ahead of
time, outside the viewport, and `padding` is the dial that decides how far ahead. Raising it
does not make drawing more frequent, it makes each draw cover more ground.

It is not free — the clip area grows quadratically, so do not reach for `padding: 2` to be safe:

| padding | clip area | cost vs default |
|---|---|---|
| `0.1` (default) | 1.2x viewport | 1x |
| `0.5` | 2x viewport | ~2.8x the area |
| `1` | 3x viewport | ~6.3x the area |
| `2` | 5x viewport | ~17x the area |

**Tiles have their own preload dial, and it is not this one.** If the basemap pops in behind a
moving marker while the vectors are fine, that is `GridLayer`'s `keepBuffer` (default `2` — rows
and columns of tiles kept beyond the view while panning), not the renderer clip. Raise it on the
`TileLayer`, not the map:

```tsx
<TileLayer url={ESRI_DARK_BASE} keepBuffer={4} maxNativeZoom={16} maxZoom={19} />
```

And if the track itself is long, `<Polyline smoothFactor={…} />` (default `1.0`) decimates it
per zoom level — raise it before raising `padding`, because a simpler path makes every redraw
cheaper instead of making redraws bigger.

**Do NOT fix this by switching to `L.canvas()` without reading “The renderer decides whether `var()` works” in SKILL.md.** Canvas is the
right renderer for thousands of shapes, but it silently destroys themed colours.

## Things that move: the three traps

Fleet tracking, delivery in flight, replay. Three traps here, all of them measured on generated
apps rather than reasoned about, and all three apps made all three mistakes.

### Never build a `divIcon` in the render path

This is the one that makes a live map look cheap, and every generated app did it:

```tsx
// WRONG — a fresh icon object on every render
export function UnitMarker({ unit, isSelected }) {
  const icon = createUnitIcon(unit, isSelected)
  return <Marker position={[unit.lat, unit.lng]} icon={icon} />
}
```

react-leaflet compares the `icon` prop **by reference** — `if (props.icon !== prevProps.icon)
marker.setIcon(props.icon)` (`react-leaflet/lib/Marker.js:12`). And Leaflet's `setIcon` calls
`this._initIcon()`, which **destroys and rebuilds the icon's DOM element** and rebinds its popup
(`leaflet-src.js:7859`). So an unmemoized factory call means: every render, every marker's
element is thrown away and recreated.

You do not see an error. You see the symptoms, and they read as bad CSS:

- **A CSS `animation: pulse 2s infinite` on the pin restarts from frame 0 every tick**, so it
  never completes a cycle and looks like a stutter. A ticking simulation re-renders constantly,
  so the pulse effectively never runs.
- `transition: transform .15s` never finishes, so hover-scale snaps instead of easing.
- An open popup is rebound underneath the user.

Memoize on the fields the icon actually depends on — not on the whole object, which is a new
reference every tick anyway:

```tsx
const icon = useMemo(
  () => createUnitIcon(unit.status, isSelected),
  [unit.status, isSelected],          // NOT [unit] — position changes must not rebuild the icon
)
```

The `[unit.status, isSelected]` deps are the whole point: a moving unit changes `lat`/`lng` every
tick but its icon does not. For a small fixed set of looks, a module-level cache keyed by
`` `${status}|${selected}` `` is simpler and shares one object across every marker.

### Cap the trail

None of the three apps capped theirs. A trail that appends a point per tick is an array that
grows forever, and it is handed to a `<Polyline>` that re-renders the whole path on every map
move — so the map gets steadily slower for as long as the app is open, with no event to blame.

```tsx
const MAX_TRAIL = 120                               // ~2 min at 1 Hz
trail: [...unit.trail, [unit.lat, unit.lng]].slice(-MAX_TRAIL)
```

Pair it with `<Polyline smoothFactor={2} />` for the trail layer — decimation costs accuracy you
do not need on a breadcrumb, and it makes every redraw cheaper rather than more frequent.

### A hidden document throttles the WHOLE simulation, not just `flyTo`

§6 covers the camera. The loop driving your data is hit too, and harder — which matters because
the code-app preview iframe reports `visibilityState: 'hidden'` permanently.

Measured in a hidden document:

| driver | behaviour when hidden |
|---|---|
| `requestAnimationFrame` | **0 fires in 7.8s** — does not run at all |
| `setInterval(fn, 1000)` | **9 fires in 36s** — an effective period of ~4000ms, 4x slow |

So an rAF-driven simulation is frozen solid in the preview, and a `setInterval` one crawls. A
"live fleet" screen that works on the dev server shows stationary vehicles in the builder.

**The fix is to stop counting ticks and start reading the clock.** A loop that advances by a
fixed step per tick runs at whatever rate the browser grants it, so throttling silently changes
the simulation's speed and every unit desynchronises:

```tsx
// WRONG — assumes the tick arrived on time
setInterval(() => advance(unit, SPEED * 1.0 /* seconds */), 1000)

// RIGHT — advance by REAL elapsed time, so a throttled tick still lands correctly
const last = useRef(Date.now())
setInterval(() => {
  const now = Date.now()
  const dtSeconds = (now - last.current) / 1000
  last.current = now
  advance(unit, SPEED * dtSeconds)
}, 1000)
```

That also fixes the tab-switch case: come back after a minute and positions jump to where they
should be, instead of resuming a minute behind.
