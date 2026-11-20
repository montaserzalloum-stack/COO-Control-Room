# `<MapAreaTools>`: props and layout

- **`map`** is the app's own `mapboxgl.Map` / `maplibregl.Map` / Leaflet `L.Map`, passed as is —
  all fit without a cast — or react-map-gl's `onLoad={(e) => setMap(e.target)}`, or react-leaflet's
  `<MapContainer ref={setMap}>`. A Leaflet map keeps the `z-0` the `maps` skill gives it.
  The tools render INTO the map's container, so they need no layout and pan and zoom with the
  ground; that container's `position: relative` comes from the library CSS (import it).
- **`points`** need numeric `lng` / `lat` and an `id`; `name` labels a point in answers. Coerce
  string coordinates. Pass exactly what the map plots, after the screen's own filters, in a
  `useMemo`: a new array re-indexes and recounts every point, which shows at 10^5 points.
- **`metric`** (optional) is the one number the screen is about; the card shows its average.
- **Colours follow the theme already**: the chrome is the app's tokens, and a new area starts in
  `var(--primary)`. Pass **`colors`** (`[{ name, color }]`, the first is the default) only when
  the brief names area colours — as theme tokens (`var(--chart-2)`), never hex copied from the
  theme, or a re-theme leaves the areas behind.
- **`onSelectionChange(area, inside)`** drives the screen's own list, table or side panel from the
  selected area. **`areas` + `onAreasChange`** only when the brief asks to keep or save areas.
- **Leave the top of the map and its end edge to the tools.** The toolbar floats at the top
  centre (sliding toward the start edge while the panel is open) and the panel takes the end
  edge. The screen's own overlays — legend, totals, filters — go in the bottom start corner or
  beside the map, and the area's count and average are not repeated in a banner: the card
  under the area already shows them. A header laid OVER the map's top edge pushes the toolbar
  down below it — put the header above the map instead, so the map keeps that space. A drawer
  down that edge pushes the panel beside it, which squeezes the map: give the drawer's content
  to the area card and the panel where you can.
- It takes over the map's drag-pan while a drawing tool is on, plus box zoom and double-click
  zoom, and puts them back on unmount; its single-letter keys (V H S R O G P L A, `?`) are the
  map screen's — bind nothing else to them there. Distances read in miles.
- It counts 10^5+ points without help (a bounding-box pass, then the exact test), but the app's
  own point layer still follows the `maps` rules and the `performance` skill: a GeoJSON circle
  layer, never a DOM marker per point.
