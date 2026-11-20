---
name: performance
description: Big data in the browser — a derived array that must keep its identity, and how many points a map layer holds before it needs a worker-indexed layer.
version: 2
---

# Performance

## A derived array keeps its identity

React compares each dependency of `useEffect`, `useMemo`, `useCallback` and `memo` with
`Object.is`, so an array or object created during render counts as changed on every render.
A data hook that returns `rows.filter(...).map(...)` re-runs every effect keyed on it, on every
render, and lint does not catch it. Memoize it on what it derives from:

```ts
const rows = useMemo(() => (q.data?.rows ?? []).filter(hasCoords), [q.data])
```

- Memoize for identity, not only cost: anything an effect, a map or chart layer, or a memoised
  child depends on.
- A list fetched page by page in a loop: collect the pages in a ref and publish the array once,
  when the last page is in.
- An effect that builds something costly (map layers, a chart) adds and removes by id instead of
  clearing and rebuilding everything.

## Map layers — read the count, then pick the layer

Applies only to an app that shows a map. Get the count from the plan, a count automation, a
record count or a paged source's total, then:

| Points in the layer | Leaflet (the default) | Mapbox GL / MapLibre GL |
|---|---|---|
| up to ~1,000 | `<Marker>` pins — the `maps` skill's *Pins*; cluster them when they overlap (its *Beyond markers*) | one GeoJSON source, `circle`/`symbol` layers |
| ~1,000 to ~20,000 | `<MarkerClusterGroup chunkedLoading>` kept clustered to street zoom (no `disableClusteringAtZoom` below 15), or `<CircleMarker>`s under `preferCanvas`. Unclustered or custom-shaped, draw them on a canvas with colours resolved to real values (canvas ignores `var()`) — never ~1,000+ `<Marker>`s | one GeoJSON source with `cluster: true` (per-category counts through `clusterProperties`); the library clusters in its own worker. `setData` once, when the last page is in — never per page. Never a `Marker` per row |
| more than ~20,000, or no count | the worker index below | as above |

One popup or panel for the clicked point, never one per pin.

Past ~20,000 on Leaflet, keep the points as plain data (`id`, `lat`, `lng`, the field they are coloured by), and once
the last page is in, index them once with supercluster in a Web Worker:

- Do not import Leaflet in the worker: it touches `window` on load.
- On every `moveend`, send the bounds and zoom and draw only what comes back. Number each request
  and drop older replies.
- Per-category counts come from `map`/`reduce`. In `reduce`, copy a nested counts object before
  adding: a parent starts as a shallow copy of its first child.
- Key clusters and points apart (`c:${cluster_id}`, `p:${id}`); a cluster click zooms to
  `getClusterExpansionZoom(cluster_id)`.
- A filter changes what is drawn, never the data or the index.
