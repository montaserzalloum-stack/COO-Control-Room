// IMPORT this when the map has an AI agent to answer (`agentId` or `chat` is required); never
// build drawing tools beside it. Its toolbar, handles, counts and area card are all here, so
// what a plan calls draw modes or a selection panel IS this component.
//
//   <div className="relative h-full">
//     <div ref={ref} className="h-full w-full" />
//     <MapAreaTools map={map} points={stores} pointLabel={{ one: 'store', other: 'stores' }}
//       metric={{ label: 'Attainment', value: (s) => s.attainment }} agentId={STORE_AGENT} />
//   </div>
//
// A screen with its own copilot: `useAreaChat`. An agent that reads fixed fields (a solution
// brief's AGENT CONTEXT): the `context` prop. The `map-actions` skill has the rest.
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  ChevronDown,
  Circle,
  Eraser,
  GripVertical,
  Hand,
  Lasso,
  MessageSquarePlus,
  MousePointer2,
  Pentagon,
  Redo2,
  Square,
  Trash2,
  Undo2,
  VectorSquare,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  METERS_PER_MILE,
  PointIndex,
  boundsOf,
  destination,
  distanceMeters,
  formatMiles,
  inRing,
  outline,
  placeCard,
  regularPolygon,
  simplify,
  type AreaShape,
  type CardSide,
  type AreaStyle,
  type LngLat,
  type MapArea,
  type ScreenPoint,
} from './areaGeometry'

export type { AreaShape, AreaStyle, MapArea } from './areaGeometry'

const AreaCopilot = lazy(() => import('./AreaCopilot'))

// THE prebuilt draw-and-ask layer for a Mapbox GL / MapLibre GL map. Mount it beside the
// map you already render and pass that map in: users draw an area (rectangle, circle,
// pentagon, polygon by points, freehand lasso), see which of `points` fall inside it, and
// ask the app's copilot about exactly those. Everything renders INTO the map's own
// container, so it pans and zooms with the map and needs no layout of its own.
//
// Rules the rest of this file depends on:
//   * Areas are stored in lng/lat, never pixels — a shape stays on its ground at any zoom.
//   * No requestAnimationFrame anywhere. The builder's preview iframe is a hidden document
//     where rAF never fires; every redraw here is driven by the map's own `move` event.
//   * With an agent, the copilot (./AreaCopilot, loaded lazily) mounts with the map and
//     stays mounted while the panel is closed: `sendMessage` is a no-op until the chat has
//     mounted, so a panel that mounted on the first question would drop that question.

/** What this component needs from a map. Typed by shape, so the template compiles with no map
 * library installed. A Mapbox GL / MapLibre GL `Map` fits as is (`new maplibregl.Map(…)`,
 * react-map-gl's `mapRef.current.getMap()`); a Leaflet `L.Map` is adapted here. Coordinates are
 * `[lng, lat]`; screen points are pixels from the container's top-left corner. */
export type AreaToolsMap = {
  /** the element the map renders into; the tools render inside it */
  getContainer(): HTMLElement
  /** takes the drawing cursor, and is the default ground for `isGround` */
  getCanvas(): HTMLElement
  project(lngLat: [number, number]): { x: number; y: number }
  unproject(point: [number, number]): { lng: number; lat: number }
  /** called only with `'move'` (the view panned or zoomed, fired as it moves) and `'resize'` */
  on(type: string, listener: (event: unknown) => void): unknown
  off(type: string, listener: (event: unknown) => void): unknown
  panBy(offset: [number, number], options?: { animate?: boolean }): unknown
  fitBounds(
    bounds: [[number, number], [number, number]],
    options?: { padding?: number; animate?: boolean; maxZoom?: number },
  ): unknown
  /** the map's own gestures, switched off while a shape is drawn */
  dragPan: MapHandler
  boxZoom: MapHandler
  doubleClickZoom: MapHandler
  /** whether a pointer event landed on the map's own ground, where a drawing may start — not on
   * a marker or popup the app placed. Default: its target is `getCanvas()`. */
  isGround?(target: EventTarget | null): boolean
  /** the tools' z-index inside the container, above the library's own layers. Default 2. */
  overlayZIndex?: number
}
type MapHandler = { enable(): void; disable(): void; isEnabled(): boolean }

/** The few methods of a Leaflet `L.Map` this component calls, typed by shape like
 * `AreaToolsMap` — pass `L.map(…)` or react-leaflet's `<MapContainer ref>` as is. */
export type LeafletAreaMap = {
  getContainer(): HTMLElement
  latLngToContainerPoint(latLng: [number, number]): { x: number; y: number }
  containerPointToLatLng(point: [number, number]): { lat: number; lng: number }
  on(type: string, listener: (event: unknown) => void): unknown
  off(type: string, listener: (event: unknown) => void): unknown
  panBy(offset: [number, number], options?: { animate?: boolean }): unknown
  fitBounds(
    bounds: [[number, number], [number, number]],
    options?: { padding?: [number, number]; animate?: boolean; maxZoom?: number },
  ): unknown
  dragging: LeafletHandler
  boxZoom: LeafletHandler
  doubleClickZoom: LeafletHandler
}
type LeafletHandler = { enable(): unknown; disable(): unknown; enabled(): boolean }

const isLeaflet = (map: AreaToolsMap | LeafletAreaMap): map is LeafletAreaMap => 'latLngToContainerPoint' in map

// Leaflet takes [lat, lng] where this component works in [lng, lat], and draws into panes
// rather than one canvas, so its container stands in for the canvas.
function fromLeaflet(map: LeafletAreaMap): AreaToolsMap {
  const container = map.getContainer()
  const handler = (h: LeafletHandler): MapHandler => ({
    enable: () => void h.enable(),
    disable: () => void h.disable(),
    isEnabled: () => h.enabled(),
  })
  return {
    getContainer: () => container,
    getCanvas: () => container,
    project: ([lng, lat]) => map.latLngToContainerPoint([lat, lng]),
    unproject: (point) => map.containerPointToLatLng(point),
    on: (type, listener) => map.on(type, listener),
    off: (type, listener) => map.off(type, listener),
    panBy: (offset, options) => map.panBy(offset, options),
    fitBounds: ([[west, south], [east, north]], options) =>
      map.fitBounds([[south, west], [north, east]], {
        ...options,
        padding: options?.padding === undefined ? undefined : [options.padding, options.padding],
      }),
    dragPan: handler(map.dragging),
    boxZoom: handler(map.boxZoom),
    doubleClickZoom: handler(map.doubleClickZoom),
    // the ground is its panes, minus the markers, tooltips and popups the app put on them
    isGround: (target) =>
      target === container ||
      (target instanceof Element &&
        !!target.closest('.leaflet-map-pane') &&
        !target.closest('.leaflet-marker-pane, .leaflet-tooltip-pane, .leaflet-popup-pane')),
    // its panes and controls sit at z-index 400-1000
    overlayZIndex: 1001,
  }
}

export type AreaPoint = { id: string | number; lng: number; lat: number; name?: string }

export type AreaMetric<P> = {
  /** what the number is — "Attainment", "Revenue" */
  label: string
  value: (point: P) => number | null | undefined
  /** how one value reads on screen — default a rounded number */
  format?: (value: number) => string
}

export type MapAreaToolsProps<P extends AreaPoint> = {
  /** the app's map — Mapbox GL, MapLibre GL or Leaflet, passed as is; the tools render once it
   * exists */
  map: AreaToolsMap | LeafletAreaMap | null | undefined
  /** what areas count — the same records the map plots */
  points: readonly P[]
  /** what one point is called on screen — default point / points */
  pointLabel?: { one: string; other: string }
  /** the number an area summarises — shown as "avg" on the area card and sent to the agent */
  metric?: AreaMetric<P>
  /** the fields the agent gets for each point inside an area — default: its plain fields */
  describe?: (point: P) => Record<string, unknown>
  /** what the agent gets INSTEAD of `{ mapArea }`, when the agent reads fixed fields (a
   * solution brief's AGENT CONTEXT): built from the selected area — null for the whole map —
   * and the points inside it. Rebuilt when this function changes, so pass it inline or list
   * everything it reads in its useCallback. It rides with every message: cap its lists. Its
   * outline is `areaGeoJSON(area)` — never cast `area` to a shape of your own. */
  context?: (area: MapArea | null, inside: readonly P[]) => Record<string, unknown>
  /** up to three questions to offer, as chips on the area card */
  suggestions?: string[]
  /** the colour swatches; the first is what a new area starts in. Any CSS colour — a theme
   * token such as `var(--primary)` keeps the areas in step with the app's theme. */
  colors?: readonly AreaColor[]
  /** controlled areas — pass with `onAreasChange` to keep or save them yourself */
  areas?: MapArea[]
  onAreasChange?: (areas: MapArea[]) => void
  /** the selected area and the points inside it (null and [] when nothing is selected) */
  onSelectionChange?: (area: MapArea | null, inside: P[]) => void
} & (
  // Every question goes to a real agent: with neither of these the map offers to ask and has
  // nothing to answer, so a map with no agent hand-rolls its drawing instead of using this.
  | {
      /** the copilot's AI agent (the id `find_ai_agent` returned) */
      agentId: string
      chat?: never
    }
  | {
      /** the screen's OWN copilot, when it already has one — see `useAreaChat`. Questions go to
       * it and no second panel opens. */
      chat: AreaChat
      agentId?: never
    }
)

/** A copilot the screen already renders, driven from the map. Pass the same object to
 * `<MapAreaTools chat>` and to the template `<Copilot link>`: the selected area joins that
 * copilot's context and the card's questions land in its conversation, so the screen keeps
 * ONE chat instead of two side by side. */
export type AreaChat = {
  /** `{ mapArea }`, or what the map's `context` returns — `<Copilot link>` merges it into its
   * runtimeContext */
  context: Record<string, unknown>
  /** filled by `<Copilot link>` once its chat has registered */
  send: RefObject<((message: string) => void) | null>
  publish: (context: Record<string, unknown>) => void
  /** called on each question from the map */
  onAsk: () => void
}

// What the agent would read, as text. Apps rebuild their records and context objects on every
// render, so identity says nothing; null when the value cannot be serialized.
function contentKey(value: unknown): string | null {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (_, v: unknown) => {
      if (typeof v === 'bigint') return v.toString()
      if (v && typeof v === 'object') {
        if (seen.has(v)) return '[seen]'
        seen.add(v)
      }
      return v
    })
  } catch {
    return null
  }
}

/** `onAsk` is where the screen opens its copilot panel. Keep that copilot MOUNTED while the
 * panel is closed: a question sent before its chat registers waits a few seconds, then goes
 * back to the area card. */
export function useAreaChat(onAsk?: () => void): AreaChat {
  const [context, setContext] = useState<Record<string, unknown>>({})
  const send = useRef<((message: string) => void) | null>(null)
  const latest = useRef(onAsk)
  latest.current = onAsk
  // The map republishes whenever the app hands it a rebuilt `points` array — and an app that
  // maps its records (`stores.map(s => ({ ...s }))`) rebuilds them on every render. Only a
  // change in what the agent would READ may re-render the app, or publish → render →
  // publish never settles.
  const published = useRef<string | null>(null)
  const publish = useCallback((next: Record<string, unknown>) => {
    const key = contentKey(next)
    if (key !== null && key === published.current) return
    published.current = key
    setContext(next)
  }, [])
  return useMemo(() => ({ context, send, publish, onAsk: () => latest.current?.() }), [context, publish])
}

/** The area's outline as a GeoJSON Polygon, one closed ring whatever was drawn (rectangle,
 * circle, polygon, lasso) — the value for an agent-context field named a boundary, geometry or
 * polygon. */
export function areaGeoJSON(area: MapArea): { type: 'Polygon'; coordinates: [number, number][][] } {
  const ring = outline(area.shape)
  const first = ring[0]
  const last = ring[ring.length - 1]
  return { type: 'Polygon', coordinates: [first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first]] }
}

export type AreaColor = { name: string; color: string }

// A new area starts in the app's own primary, kept as the token rather than its value so it
// follows a theme switch or a re-theme. The rest are annotation ink, not data: the pins
// already carry saturated status colours, so these are pulled down in chroma and toward
// slate to read as marks ON the map.
const DEFAULT_COLORS: readonly AreaColor[] = [
  { name: 'Primary', color: 'var(--primary)' },
  { name: 'Red', color: '#BE534D' },
  { name: 'Amber', color: '#BC7F3E' },
  { name: 'Green', color: '#3E8A63' },
  { name: 'Blue', color: '#4B6DA3' },
  { name: 'Violet', color: '#7461A2' },
]
const DEFAULT_STYLE: Omit<AreaStyle, 'color'> = { fill: 14, stroke: 2, dashed: false }
// handles and vertices are punched out of the map in its own surface colour
const KNOCKOUT = 'var(--background)'
// Colours reach the SVG through `style`, never the fill/stroke attributes: a theme colour is a
// `var()`, which every browser resolves in CSS but not every one in a presentation attribute.
const ink = (color: string) => ({ fill: color, stroke: color })
const line = (color: string) => ({ fill: 'none', stroke: color })
const knockout = (color: string) => ({ fill: KNOCKOUT, stroke: color })
const POINTS = { one: 'point', other: 'points' }
// structural equality a few levels deep — enough for a record and its nested fields
function sameValue(a: unknown, b: unknown, depth: number): boolean {
  if (Object.is(a, b)) return true
  if (depth === 0 || !a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], depth - 1))
}
const NO_SUGGESTIONS: string[] = []

type Tool = 'select' | 'pan' | 'shape' | 'path' | 'lasso'
type ShapeKind = 'rect' | 'circle' | 'pentagon'

const SHAPES: { kind: ShapeKind; label: string; key: string; Icon: typeof Square }[] = [
  { kind: 'rect', label: 'Rectangle', key: 'R', Icon: Square },
  { kind: 'circle', label: 'Circle', key: 'O', Icon: Circle },
  { kind: 'pentagon', label: 'Pentagon', key: 'G', Icon: Pentagon },
]

const DOCK_WIDTH = 368
const BAR_TOP = 12
const CARD_WIDTH = 344
const HISTORY_LIMIT = 40
// What rides along with each question. The agent gets every point's fields up to this
// many, then the count and summary only — a national network does not fit in a message.
const CONTEXT_POINT_LIMIT = 200
const RING_LIMIT = 400
const HIT_PX = 9
// A click drops a shape at a fixed ON-SCREEN size, whatever the zoom.
const DEFAULT_PX = { rect: [192, 135], circle: 80, pentagon: 90 } as const
const WHOLE_MAP = 'the whole map'

type Handle =
  | { type: 'corner'; corner: Corner }
  | { type: 'radius' }
  | { type: 'vertex'; index: number }
  | { type: 'scale'; corner: Corner }
type Corner = 'nw' | 'ne' | 'se' | 'sw'

type Draft =
  | { tool: 'shape'; kind: ShapeKind; anchor: LngLat; to: ScreenPoint; square: boolean }
  | { tool: 'path'; points: LngLat[]; cursor: ScreenPoint | null; near: boolean }
  | { tool: 'lasso'; points: LngLat[] }

type Gesture =
  | { kind: 'empty'; start: ScreenPoint }
  | { kind: 'move'; id: string; start: ScreenPoint; original: AreaShape; before: MapArea[]; moved: boolean }
  | { kind: 'handle'; id: string; handle: Handle; original: AreaShape; before: MapArea[]; moved: boolean }
  // the drawing in progress lives HERE, not only in state: a pointerup can land before React
  // has rendered the moves before it, and a fast lasso would lose its tail
  | { kind: 'shape'; shapeKind: ShapeKind; anchor: LngLat }
  | { kind: 'lasso'; points: LngLat[] }
  | { kind: 'bar'; offset: ScreenPoint }
  | { kind: 'card'; id: string; start: ScreenPoint; origin: [number, number] }

type Projector = {
  toScreen: (lngLat: LngLat) => ScreenPoint
  toLngLat: (point: ScreenPoint) => LngLat
}

const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad)/.test(navigator.userAgent)
const MOD = isMac ? '⌘' : 'Ctrl+'

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function projector(map: AreaToolsMap): Projector {
  return {
    toScreen: (lngLat) => {
      const p = map.project(lngLat)
      return [p.x, p.y]
    },
    toLngLat: (point) => {
      const q = map.unproject(point)
      return [q.lng, q.lat]
    },
  }
}

const plural = (n: number, label: { one: string; other: string }) =>
  `${n.toLocaleString()} ${n === 1 ? label.one : label.other}`

function plainFields(point: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(point)) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value
  }
  return out
}

const nameOf = (point: AreaPoint) => point.name ?? String(point.id)

function nextAreaName(areas: readonly MapArea[]): string {
  let highest = 0
  for (const area of areas) {
    const n = /^Area (\d+)$/.exec(area.name)
    if (n) highest = Math.max(highest, Number(n[1]))
  }
  return `Area ${highest + 1}`
}

function screenRing(shape: AreaShape, p: Projector): ScreenPoint[] {
  return outline(shape).map(p.toScreen)
}

function screenBox(ring: readonly ScreenPoint[]) {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [x, y] of ring) {
    if (x < left) left = x
    if (x > right) right = x
    if (y < top) top = y
    if (y > bottom) bottom = y
  }
  return { left, top, right, bottom }
}

const CORNER_CURSOR: Record<Corner, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
}

function cornerAt(box: ReturnType<typeof screenBox>, corner: Corner): ScreenPoint {
  return [corner.endsWith('w') ? box.left : box.right, corner.startsWith('n') ? box.top : box.bottom]
}

const handleKey = (hit: { id: string; handle?: Handle } | null) => (hit ? `${hit.id}:${JSON.stringify(hit.handle ?? '')}` : '')

function opposite(corner: Corner): Corner {
  return ({ nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' } as const)[corner]
}

const RECT_CORNERS = ['nw', 'ne', 'se', 'sw'] as const

function rectCorner(shape: Extract<AreaShape, { kind: 'rect' }>, corner: Corner): LngLat {
  return [corner.endsWith('w') ? shape.west : shape.east, corner.startsWith('n') ? shape.north : shape.south]
}

/** The grab points of a selected shape, where they sit on screen. */
function handlesOf(shape: AreaShape, p: Projector): { handle: Handle; at: ScreenPoint }[] {
  if (shape.kind === 'rect') {
    // the rectangle's own corners, not its screen box: on a rotated map they differ
    return RECT_CORNERS.map((corner) => ({ handle: { type: 'corner', corner }, at: p.toScreen(rectCorner(shape, corner)) }))
  }
  if (shape.kind === 'circle') {
    return [{ handle: { type: 'radius' }, at: p.toScreen(destination(shape.center, shape.radiusMeters, 90)) }]
  }
  // a lasso has too many vertices to edit one by one — four corners scale the whole outline
  if (shape.freehand || shape.ring.length > 10) {
    const box = screenBox(screenRing(shape, p))
    return RECT_CORNERS.map((corner) => ({
      handle: { type: 'scale', corner },
      at: cornerAt(box, corner),
    }))
  }
  return shape.ring.map((vertex, index) => ({ handle: { type: 'vertex', index }, at: p.toScreen(vertex) }))
}

function rectFrom(a: LngLat, b: LngLat): AreaShape {
  const [west, south, east, north] = boundsOf([a, b])
  return { kind: 'rect', west, south, east, north }
}

/** The shape a drag from `a` to `b` describes, or the default-size shape a click drops. */
function shapeFromScreen(kind: ShapeKind, a: ScreenPoint, b: ScreenPoint, square: boolean, p: Projector): AreaShape {
  let [dx, dy] = [b[0] - a[0], b[1] - a[1]]
  if (Math.hypot(dx, dy) < 7) {
    if (kind === 'rect') {
      const [w, h] = DEFAULT_PX.rect
      return rectFrom(p.toLngLat([a[0] - w / 2, a[1] - h / 2]), p.toLngLat([a[0] + w / 2, a[1] + h / 2]))
    }
    return shapeAround(kind, a, kind === 'circle' ? DEFAULT_PX.circle : DEFAULT_PX.pentagon, p)
  }
  if (kind === 'rect') {
    if (square) {
      const side = Math.max(Math.abs(dx), Math.abs(dy))
      dx = (dx < 0 ? -1 : 1) * side
      dy = (dy < 0 ? -1 : 1) * side
    }
    return rectFrom(p.toLngLat(a), p.toLngLat([a[0] + dx, a[1] + dy]))
  }
  const mid: ScreenPoint = [a[0] + dx / 2, a[1] + dy / 2]
  return shapeAround(kind, mid, Math.max(Math.abs(dx), Math.abs(dy)) / 2, p)
}

/** A click-dropped shape under the toolbar reads as broken — slide it clear, below the bar.
 * The ghost goes through this too, so the preview lands where the click will. */
function clearOfBar(shape: AreaShape, p: Projector, bar: HTMLElement | null, host: HTMLElement): AreaShape {
  if (!bar) return shape
  const b = bar.getBoundingClientRect()
  const h = host.getBoundingClientRect()
  const box = screenBox(screenRing(shape, p))
  const barBottom = b.bottom - h.top + 10
  const overlaps =
    box.right > b.left - h.left - 10 &&
    box.left < b.right - h.left + 10 &&
    box.top < barBottom &&
    box.bottom > b.top - h.top - 10
  return overlaps ? translate(shape, [0, barBottom - box.top + 6], p) : shape
}

function shapeAround(kind: 'circle' | 'pentagon', center: ScreenPoint, radiusPx: number, p: Projector): AreaShape {
  if (kind === 'circle') {
    const c = p.toLngLat(center)
    return { kind: 'circle', center: c, radiusMeters: distanceMeters(c, p.toLngLat([center[0] + radiusPx, center[1]])) }
  }
  return { kind: 'polygon', ring: regularPolygon(center, radiusPx, 5).map(p.toLngLat) }
}

/** Move a shape by a screen offset — through the projection, so it lands where the pointer is. */
function translate(shape: AreaShape, [dx, dy]: ScreenPoint, p: Projector): AreaShape {
  const shift = (ll: LngLat): LngLat => {
    const [x, y] = p.toScreen(ll)
    return p.toLngLat([x + dx, y + dy])
  }
  if (shape.kind === 'circle') return { ...shape, center: shift(shape.center) }
  if (shape.kind === 'rect') return rectFrom(shift([shape.west, shape.north]), shift([shape.east, shape.south]))
  return { ...shape, ring: shape.ring.map(shift) }
}

/** The shape with `handle` dragged to `to`, or null when that would collapse it — the caller
 * keeps the last good outline rather than snapping back to where the drag began. */
function dragHandle(shape: AreaShape, handle: Handle, to: ScreenPoint, p: Projector): AreaShape | null {
  if (shape.kind === 'rect' && handle.type === 'corner') {
    const fixed = rectCorner(shape, opposite(handle.corner))
    const [fx, fy] = p.toScreen(fixed)
    if (Math.hypot(to[0] - fx, to[1] - fy) < 12) return null
    return rectFrom(fixed, p.toLngLat(to))
  }
  if (shape.kind === 'circle' && handle.type === 'radius') {
    const center = p.toScreen(shape.center)
    const radiusPx = Math.max(6, Math.hypot(to[0] - center[0], to[1] - center[1]))
    return { ...shape, radiusMeters: distanceMeters(shape.center, p.toLngLat([center[0] + radiusPx, center[1]])) }
  }
  if (shape.kind === 'polygon' && handle.type === 'vertex') {
    const ring = shape.ring.slice()
    ring[handle.index] = p.toLngLat(to)
    return { ...shape, ring }
  }
  if (shape.kind === 'polygon' && handle.type === 'scale') {
    // scale the outline about the far corner, never below 10px across
    const ring = screenRing(shape, p)
    const box = screenBox(ring)
    const [ax, ay] = cornerAt(box, opposite(handle.corner))
    const [mx, my] = cornerAt(box, handle.corner)
    const limit = (span: number, s: number) => (Math.abs(span * s) < 10 ? (10 / Math.abs(span || 1)) * (s < 0 ? -1 : 1) : s)
    const sx = limit(mx - ax, mx - ax ? (to[0] - ax) / (mx - ax) : 1)
    const sy = limit(my - ay, my - ay ? (to[1] - ay) / (my - ay) : 1)
    return { ...shape, ring: ring.map(([x, y]) => p.toLngLat([ax + (x - ax) * sx, ay + (y - ay) * sy])) }
  }
  return shape
}

/** Keep the `n` best of a stream in order — one pass, no sort over the whole set. */
function keepBest<T>(best: { item: T; value: number }[], item: T, value: number, n: number, better: (a: number, b: number) => boolean) {
  if (best.length === n && !better(value, best[n - 1].value)) return
  let at = best.length
  while (at > 0 && better(value, best[at - 1].value)) at--
  best.splice(at, 0, { item, value })
  if (best.length > n) best.pop()
}

function summarize<P extends AreaPoint>(points: readonly P[], indices: readonly number[], metric?: AreaMetric<P>) {
  let sum = 0
  let counted = 0
  const lowest: { item: P; value: number }[] = []
  const highest: { item: P; value: number }[] = []
  if (metric) {
    for (const i of indices) {
      const value = metric.value(points[i])
      if (typeof value === 'number' && Number.isFinite(value)) {
        sum += value
        counted++
        keepBest(lowest, points[i], value, 5, (a, b) => a < b)
        keepBest(highest, points[i], value, 5, (a, b) => a > b)
      }
    }
  }
  const named = (list: { item: P; value: number }[]) => list.map(({ item, value }) => ({ point: item, value }))
  return { count: indices.length, average: counted ? sum / counted : null, lowest: named(lowest), highest: named(highest) }
}

const formatValue = <P,>(metric: AreaMetric<P>, value: number) =>
  metric.format ? metric.format(value) : Math.round(value).toLocaleString()

function shapeForAgent(shape: AreaShape) {
  const round = ([lng, lat]: LngLat): LngLat => [+lng.toFixed(5), +lat.toFixed(5)]
  if (shape.kind === 'circle') {
    return { kind: 'circle', center: round(shape.center), radiusMiles: +(shape.radiusMeters / METERS_PER_MILE).toFixed(2) }
  }
  if (shape.kind === 'rect') {
    return { kind: 'rectangle', west: shape.west, south: shape.south, east: shape.east, north: shape.north }
  }
  return { kind: shape.freehand ? 'freehand' : 'polygon', ring: shape.ring.map(round) }
}

export function MapAreaTools<P extends AreaPoint>({
  map: appMap,
  points,
  pointLabel: labelProp = POINTS,
  metric,
  describe = plainFields,
  context,
  agentId,
  chat,
  suggestions = NO_SUGGESTIONS,
  colors = DEFAULT_COLORS,
  areas: controlledAreas,
  onAreasChange,
  onSelectionChange,
}: MapAreaToolsProps<P>) {
  const map = useMemo(() => (appMap && isLeaflet(appMap) ? fromLeaflet(appMap) : appMap), [appMap])
  // Apps pass `metric`, `describe` and `pointLabel` inline, so their identity changes every
  // render. Read through a ref and key the memos on what they SAY, or every pointer move
  // would rebuild the copilot's context and re-render the conversation.
  const config = useRef({ metric, describe })
  config.current = { metric, describe }
  const pointLabel = useMemo(() => ({ one: labelProp.one, other: labelProp.other }), [labelProp.one, labelProp.other])
  const metricLabel = metric?.label
  const [ownAreas, setOwnAreas] = useState<MapArea[]>([])
  const areas = controlledAreas ?? ownAreas
  const [tool, setTool] = useState<Tool>('pan')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('rect')
  const palette = colors.length ? colors : DEFAULT_COLORS
  const [style, setStyle] = useState<AreaStyle>(() => ({ ...DEFAULT_STYLE, color: palette[0].color }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ id: string; handle?: Handle } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [ghost, setGhost] = useState<ScreenPoint | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [dockOpen, setDockOpen] = useState(false)
  const [keysOpen, setKeysOpen] = useState(false)
  const [barPos, setBarPos] = useState<ScreenPoint | null>(null)
  const [barTop, setBarTop] = useState(BAR_TOP)
  const [dockTop, setDockTop] = useState(0)
  const [endCover, setEndCover] = useState(0)
  const [cardOffsets, setCardOffsets] = useState<Record<string, [number, number]>>({})
  // bumped when a moved or reshaped area is let go: its card chooses its side again then, and
  // never mid-drag
  const [cardSettled, setCardSettled] = useState(0)
  const [questions, setQuestions] = useState<Record<string, string>>({})
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [, setHistoryVersion] = useState(0)
  const history = useRef<{ undo: MapArea[][]; redo: MapArea[][] }>({ undo: [], redo: [] })
  const gesture = useRef<Gesture | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const sendRef = useRef<((message: string) => void) | null>(null)

  const index = useMemo(() => new PointIndex(points), [points])
  const selected = areas.find((a) => a.id === selectedId) ?? null
  // Counting is the one O(points) step. Deferred, so a drag over a 300k-point layer keeps
  // the outline under the pointer and lets the count catch up — but only a drag of the SAME
  // area may lag: a newly selected area is counted at once, or its name would travel with
  // the previous area's points.
  const target = useMemo(
    () => (selected ? { id: selected.id, shape: selected.shape } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected?.id, selected?.shape],
  )
  const deferred = useDeferredValue(target)
  const caughtUp = !!target && deferred?.id === target.id
  const deferredInside = useMemo(() => (deferred ? index.inside(deferred.shape) : null), [index, deferred])
  const freshInside = useMemo(() => (target && !caughtUp ? index.inside(target.shape) : null), [index, target, caughtUp])
  const insideSelected = target ? (caughtUp ? deferredInside : freshInside) : null
  const narrow = size.width > 0 && size.width < 640
  const dockWidth = narrow ? size.width : DOCK_WIDTH

  const write = useCallback(
    (next: MapArea[]) => {
      if (controlledAreas === undefined) setOwnAreas(next)
      onAreasChange?.(next)
    },
    [controlledAreas, onAreasChange],
  )
  const record = useCallback((before: MapArea[]) => {
    const h = history.current
    h.undo.push(before)
    if (h.undo.length > HISTORY_LIMIT) h.undo.shift()
    h.redo = []
    setHistoryVersion((v) => v + 1)
  }, [])

  // Everything the native listeners below read, current as of the last render. They are
  // bound once per map; reading through this ref keeps them from going stale.
  const live = useRef({ tool, shapeKind, style, areas, selectedId, draft, spaceHeld, dockOpen, keysOpen })
  live.current = { tool, shapeKind, style, areas, selectedId, draft, spaceHeld, dockOpen, keysOpen }

  // the panel covers the right of the map, so the ground slides out from under it; closing
  // undoes exactly the slide that opening made, even if the width crossed `narrow` between
  const dockShift = useRef(0)
  const openDock = useCallback(
    (open: boolean) => {
      if (!map || open === live.current.dockOpen) return
      const rtl = getComputedStyle(map.getContainer()).direction === 'rtl'
      const shift = open ? (narrow ? 0 : ((rtl ? -1 : 1) * (DOCK_WIDTH + 24)) / 2) : -dockShift.current
      if (shift) map.panBy([shift, 0], { animate: false })
      dockShift.current = open ? shift : 0
      setDockOpen(open)
    },
    [map, narrow],
  )

  const appHandlers = useRef({ dragPan: true, boxZoom: true, doubleClickZoom: true })
  const releasePan = useCallback(() => {
    if (!map) return
    const s = live.current
    const drawing = s.tool === 'shape' || s.tool === 'path' || s.tool === 'lasso'
    if ((!drawing || s.spaceHeld) && appHandlers.current.dragPan) map.dragPan.enable()
  }, [map])

  // Abandon the press in progress: nothing it was drawing is kept, and an area it was moving
  // goes back. False when there was nothing to abandon (bare ground is the map's own pan).
  const cancelGesture = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    if (!g || g.kind === 'empty') return false
    setDraft(null)
    if ((g.kind === 'move' || g.kind === 'handle') && g.moved) write(g.before)
    releasePan()
    return true
  }, [releasePan, write])

  const changeTool = useCallback((next: Tool) => {
    cancelGesture()
    setTool(next)
    setDraft(null)
    setGhost(null)
    if (next !== 'select') setSelectedId(null)
  }, [cancelGesture])

  const commit = useCallback(
    (shape: AreaShape) => {
      const before = live.current.areas
      const area: MapArea = { id: uid(), name: nextAreaName(before), shape, style: live.current.style }
      record(before)
      write([...before, area])
      setDraft(null)
      setSelectedId(area.id)
      setTool('select')
    },
    [record, write],
  )

  const closePath = useCallback(() => {
    const d = live.current.draft
    if (!map || !d || d.tool !== 'path') return
    const p = projector(map)
    // a double-click lands a second point on the first one — drop near-duplicates
    const ring = d.points.filter((pt, i) => {
      if (!i) return true
      const [ax, ay] = p.toScreen(d.points[i - 1])
      const [bx, by] = p.toScreen(pt)
      return Math.hypot(ax - bx, ay - by) > 3
    })
    if (ring.length >= 3) commit({ kind: 'polygon', ring })
  }, [map, commit])

  const removeSelected = useCallback(() => {
    const { areas: current, selectedId: id } = live.current
    if (!id) return
    record(current)
    write(current.filter((a) => a.id !== id))
    setSelectedId(null)
  }, [record, write])

  const undo = useCallback(() => {
    const h = history.current
    const previous = h.undo.pop()
    if (!previous) return
    h.redo.push(live.current.areas)
    write(previous)
    setSelectedId(null)
    setHistoryVersion((v) => v + 1)
  }, [write])

  const redo = useCallback(() => {
    const h = history.current
    const next = h.redo.pop()
    if (!next) return
    h.undo.push(live.current.areas)
    write(next)
    setSelectedId(null)
    setHistoryVersion((v) => v + 1)
  }, [write])

  const duplicate = useCallback(() => {
    const { areas: current, selectedId: id } = live.current
    const source = current.find((a) => a.id === id)
    if (!map || !source) return
    const copy: MapArea = {
      id: uid(),
      name: nextAreaName(current),
      shape: translate(source.shape, [18, 18], projector(map)),
      style: source.style,
    }
    record(current)
    write([...current, copy])
    setSelectedId(copy.id)
  }, [map, record, write])

  const zoomToFit = useCallback(() => {
    if (!map) return
    const fromPoints = index.bounds()
    const ring = live.current.areas.flatMap((a) => outline(a.shape))
    const b = fromPoints ?? (ring.length ? boundsOf(ring) : null)
    if (!b) return
    map.fitBounds(
      [
        [b[0], b[1]],
        [b[2], b[3]],
      ],
      { padding: 60, animate: false, maxZoom: 14 },
    )
  }, [map, index])

  // one drag of the fill slider is one edit, not one undo step per percent
  const lastStyleEdit = useRef<{ id: string; fields: string; at: number } | null>(null)
  const applyStyle = useCallback(
    (patch: Partial<AreaStyle>) => {
      setStyle((s) => ({ ...s, ...patch }))
      const { areas: current, selectedId: id } = live.current
      if (!id) return
      const fields = Object.keys(patch).join()
      const at = Date.now()
      const last = lastStyleEdit.current
      if (!last || last.id !== id || last.fields !== fields || at - last.at > 600) record(current)
      lastStyleEdit.current = { id, fields, at }
      write(current.map((a) => (a.id === id ? { ...a, style: { ...a.style, ...patch } } : a)))
    },
    [record, write],
  )

  const allIndices = useMemo(() => Array.from({ length: points.length }, (_, i) => i), [points.length])
  const scopeIndices = selected && insideSelected ? insideSelected : allIndices
  const scopeSummary = useMemo(
    () => summarize(points, scopeIndices, config.current.metric),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, scopeIndices, metricLabel],
  )

  // What the agent knows about the map with every message: the selected area — or the whole
  // map — its outline, its summary, and the points inside it, capped.
  const selectedName = selected?.name
  const selectedShape = selected?.shape
  const builtContext = useMemo(() => {
    const { metric: m, describe: d } = config.current
    if (context) return scopeIndices === allIndices ? context(null, points) : context(selected, scopeIndices.map((i) => points[i]))
    const s = scopeSummary
    return {
      mapArea: {
        name: selectedName ?? WHOLE_MAP,
        shape: selectedShape ? shapeForAgent(selectedShape) : null,
        pointLabel: pointLabel.other,
        pointCount: s.count,
        ...(m && s.average !== null
          ? {
              metric: {
                label: m.label,
                average: +s.average.toFixed(2),
                lowest: s.lowest.slice(0, 3).map(({ point, value }) => ({ name: nameOf(point), value })),
                highest: s.highest.slice(0, 3).map(({ point, value }) => ({ name: nameOf(point), value })),
              },
            }
          : {}),
        points: scopeIndices.slice(0, CONTEXT_POINT_LIMIT).map((i) => d(points[i])),
        pointsTruncated: scopeIndices.length > CONTEXT_POINT_LIMIT,
      },
    }
    // the area's name and outline, not every restyle of it — and `context` itself, because it
    // reads what is on screen (filters, the open record) and only the app knows when that moved.
    // The map's own state changes (hover, drawing) never change this prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName, selectedShape, scopeIndices, scopeSummary, points, pointLabel.other, context])

  // an inline `context` rebuilds on every parent render; same content must stay the same
  // object, or the panel's memo breaks and the conversation re-renders for nothing
  const stableContext = useRef<{ key: string | null; value: Record<string, unknown> }>({ key: null, value: {} })
  const contextKey = contentKey(builtContext)
  if (contextKey === null || contextKey !== stableContext.current.key) stableContext.current = { key: contextKey, value: builtContext }
  const runtimeContext = stableContext.current.value

  const scope = useMemo(
    () =>
      selected
        ? { name: selected.name, color: selected.style.color, kind: selected.shape.kind, count: insideSelected?.length ?? 0 }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected?.name, selected?.style.color, selected?.shape.kind, insideSelected?.length],
  )

  const ask = useCallback(
    (question: string, areaId?: string) => {
      const q = question.trim()
      if (!q) return
      const { areas: current, selectedId: id } = live.current
      const area = current.find((a) => a.id === (areaId ?? id)) ?? null
      if (chat) chat.onAsk()
      else openDock(true)
      if (area) setQuestions((all) => ({ ...all, [area.id]: '' }))
      const target = chat ? chat.send : sendRef
      // the area rides in runtimeContext; naming it in the text keeps the chat history
      // readable after the area itself is gone
      const message = area ? `${area.name}: ${q}` : q
      // the copilot's runtime loads lazily, so its chat can take seconds to accept a message
      const trySend = (attempt: number) => {
        if (target.current) target.current(message)
        else if (attempt < 60) window.setTimeout(() => trySend(attempt + 1), 250)
        // nothing took it: hand the question back rather than lose what was typed
        else if (area) setQuestions((all) => (all[area.id] ? all : { ...all, [area.id]: q }))
      }
      trySend(0)
    },
    [chat, openDock],
  )
  const closeDock = useCallback(() => openDock(false), [openDock])
  const toggleAsk = useCallback(() => (chat ? chat.onAsk() : openDock(!live.current.dockOpen)), [chat, openDock])
  const publish = chat?.publish
  useEffect(() => publish?.(runtimeContext), [publish, runtimeContext])
  // a map that is gone must not keep answering for its last area
  useEffect(() => () => publish?.({}), [publish])

  // Reported when the area or the points inside it change — compared by value, not by
  // object: an app that rebuilds its records each render (`stores.map(s => ({ ...s }))`)
  // and sets state here would otherwise re-render, recount and call back forever, while an
  // edited field (fresh data, same ids) still has to reach the app's panel.
  const reported = useRef<{ id: string | null; inside: P[] } | null>(null)
  useEffect(() => {
    if (!onSelectionChange) return
    const id = selected?.id ?? null
    const inside = selected && insideSelected ? insideSelected.map((i) => points[i]) : []
    const last = reported.current
    if (last && last.id === id && last.inside.length === inside.length && last.inside.every((r, i) => sameValue(r, inside[i], 3))) return
    reported.current = { id, inside }
    onSelectionChange(selected, inside)
    // the area's id and what is inside it — not every live drag frame of its outline
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, insideSelected, points])

  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    const update = () => setSize({ width: container.clientWidth, height: container.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])

  // Screens float their own header over a full-bleed map, often right across its top edge,
  // and a toolbar or a panel header under it can be neither seen nor clicked. So the top is
  // measured, not trusted: whatever the app paints over a spot pushes that part down below
  // it. HOME spots are probed, not current ones, so things move back up once the cover goes.
  // Re-checked whenever the page changes, because a header often renders only once its data
  // arrives.
  const linked = !!chat
  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    const place = () => {
      // An open modal menu or dialog (this toolbar's own shape picker included) switches
      // pointer events off on <body>, and hit-testing then sees through every header that
      // does not opt back in — the probe would find no cover and drop the toolbar under it.
      // Closing it removes its portal, which brings this back with the page live again.
      if (getComputedStyle(document.body).pointerEvents === 'none') return
      const host = container.getBoundingClientRect()
      const coverAt = (xs: number[], y: number) => {
        let cover = 0
        for (const x of xs) {
          for (const el of document.elementsFromPoint(x, y)) {
            // the map and everything on it — its own controls, these tools — is not a cover
            if (container.contains(el)) break
            const box = el.getBoundingClientRect()
            // a backdrop or a full-height panel is not a header to sit under
            if (box.height > host.height * 0.4) continue
            cover = Math.max(cover, box.bottom - host.top)
          }
        }
        return cover
      }
      const bar = barRef.current
      if (bar && !barPos) {
        const r = bar.getBoundingClientRect()
        const cover = coverAt([r.left + 8, r.left + r.width / 2, r.right - 8], host.top + BAR_TOP + r.height / 2)
        setBarTop(cover > BAR_TOP ? cover + 8 : BAR_TOP)
      }
      const rtl = getComputedStyle(container).direction === 'rtl'
      if (!linked) {
        const dockXs = rtl
          ? [host.left + 24, Math.min(host.right, host.left + DOCK_WIDTH) - 24]
          : [Math.max(host.left, host.right - DOCK_WIDTH) + 24, host.right - 24]
        setDockTop(coverAt(dockXs, host.top + 24))
      }
      // A drawer the app lays down its end edge is no header to sit under — the panel and the
      // card would open behind it, hiding the answer, so they sit beside it instead.
      let drawer = 0
      for (const el of document.elementsFromPoint(rtl ? host.left + 8 : host.right - 8, host.top + host.height / 2)) {
        if (container.contains(el)) break
        const box = el.getBoundingClientRect()
        if (box.height > host.height * 0.4 && box.width < host.width * 0.6) {
          drawer = Math.max(drawer, rtl ? box.right - host.left : host.right - box.left)
        }
      }
      setEndCover(drawer)
    }
    place()
    // the app adding or swapping its own elements — never the map's churn underneath us
    let pending = 0
    const schedule = () => {
      window.clearTimeout(pending)
      pending = window.setTimeout(place, 150)
    }
    const observer = new MutationObserver((records) => {
      if (!records.every((r) => container.contains(r.target))) schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    // a drawer that slides in is only where it ends up once the slide has finished
    const onTransitionEnd = (e: TransitionEvent) => {
      if (!(e.target instanceof Node && container.contains(e.target))) schedule()
    }
    document.addEventListener('transitionend', onTransitionEnd)
    return () => {
      observer.disconnect()
      document.removeEventListener('transitionend', onTransitionEnd)
      window.clearTimeout(pending)
    }
  }, [map, barPos, linked, size.width, size.height])

  // The panel takes the map's end edge, where the library keeps its own controls (zoom,
  // attribution): move those corners out from under it while it is open, in step with its
  // slide (`transition-transform`'s 150ms).
  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    const end = getComputedStyle(container).direction === 'rtl' ? 'left' : 'right'
    const corners = [
      ...container.querySelectorAll<HTMLElement>(
        `.mapboxgl-ctrl-top-${end}, .mapboxgl-ctrl-bottom-${end}, .maplibregl-ctrl-top-${end}, .maplibregl-ctrl-bottom-${end}, .leaflet-${end}`,
      ),
    ]
    const inset = narrow ? 0 : (dockOpen ? DOCK_WIDTH : 0) + endCover
    for (const corner of corners) {
      corner.style.transition = `${end} 150ms cubic-bezier(0.4, 0, 0.2, 1)`
      corner.style[end] = inset ? `${inset}px` : ''
    }
    return () => {
      for (const corner of corners) {
        corner.style.transition = ''
        corner.style[end] = ''
      }
    }
  }, [map, dockOpen, narrow, endCover])

  // Which of the map's own gestures stay on. Drawing owns the drag, Shift-drag (box zoom
  // would fight Shift-for-square) and double-click (it closes a polygon). A handler the app
  // switched off itself is never switched back on.
  useEffect(() => {
    if (!map) return
    // Held from here: leaving the page runs the page's own cleanup first, and Mapbox GL's
    // remove() drops its canvas, so asking for it at teardown crashes the app.
    const canvas = map.getCanvas()
    const initial = {
      dragPan: map.dragPan.isEnabled(),
      boxZoom: map.boxZoom.isEnabled(),
      doubleClickZoom: map.doubleClickZoom.isEnabled(),
    }
    appHandlers.current = initial
    return () => {
      for (const name of ['dragPan', 'boxZoom', 'doubleClickZoom'] as const) {
        if (initial[name]) map[name].enable()
        else map[name].disable()
      }
      canvas.style.cursor = ''
    }
  }, [map])
  useEffect(() => {
    if (!map) return
    const allowed = appHandlers.current
    const drawing = tool === 'shape' || tool === 'path' || tool === 'lasso'
    const set = (name: keyof typeof allowed, on: boolean) => (on && allowed[name] ? map[name].enable() : map[name].disable())
    set('dragPan', !drawing || spaceHeld)
    set('boxZoom', !drawing)
    set('doubleClickZoom', !drawing)
  }, [map, tool, spaceHeld])

  useEffect(() => {
    if (!map) return
    const canvas = map.getCanvas()
    canvas.style.cursor =
      spaceHeld || tool === 'pan'
        ? ''
        : tool === 'select'
          ? hover?.handle
            ? hover.handle.type === 'corner' || hover.handle.type === 'scale'
              ? CORNER_CURSOR[hover.handle.corner]
              : hover.handle.type === 'radius'
                ? 'ew-resize'
                : 'grab'
            : hover
              ? 'move'
              : ''
          : 'crosshair'
  }, [map, tool, hover, spaceHeld])

  const actions = useRef({ commit, closePath, removeSelected, undo, redo, duplicate, zoomToFit, openDock, toggleAsk, changeTool, write, record, cancelGesture, releasePan })
  actions.current = { commit, closePath, removeSelected, undo, redo, duplicate, zoomToFit, openDock, toggleAsk, changeTool, write, record, cancelGesture, releasePan }

  // Pointer input. Listening on the map's CONTAINER in the capture phase means a gesture
  // this layer claims (drawing, or grabbing an area) is seen before the map's own handlers
  // — preventDefault there suppresses the mousedown the map pans from, and dragPan is off
  // for the gesture so touch cannot pan either. Anything unclaimed falls through to the
  // map, so a drag on empty ground still pans in Select.
  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    const canvas = map.getCanvas()
    const onGround = (target: EventTarget | null) => (map.isGround ? map.isGround(target) : target === canvas)
    const p = projector(map)
    const local = (e: PointerEvent): ScreenPoint => {
      const r = container.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    // the click that follows a claimed press is ours too — the app's own map click handlers
    // (a pin's popup, a selection) must not fire under a shape being drawn
    let swallowClick = false
    const claim = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      map.dragPan.disable()
      swallowClick = true
    }
    const hitTest = (at: ScreenPoint): { id: string; handle?: Handle } | null => {
      const { areas: current, selectedId: id } = live.current
      const chosen = current.find((a) => a.id === id)
      if (chosen) {
        for (const h of handlesOf(chosen.shape, p)) {
          if (Math.hypot(h.at[0] - at[0], h.at[1] - at[1]) <= HIT_PX) return { id: chosen.id, handle: h.handle }
        }
      }
      for (let i = current.length - 1; i >= 0; i--) {
        if (inRing(at[0], at[1], screenRing(current[i].shape, p))) return { id: current[i].id }
      }
      return null
    }

    const onDown = (e: PointerEvent) => {
      swallowClick = false
      if (e.button !== 0 || !onGround(e.target)) return
      const s = live.current
      if (s.spaceHeld || s.tool === 'pan') return
      const at = local(e)
      if (s.tool === 'select') {
        const hit = hitTest(at)
        if (!hit) {
          gesture.current = { kind: 'empty', start: at }
          return
        }
        claim(e)
        const area = s.areas.find((a) => a.id === hit.id)!
        setSelectedId(hit.id)
        gesture.current = hit.handle
          ? { kind: 'handle', id: hit.id, handle: hit.handle, original: area.shape, before: s.areas, moved: false }
          : { kind: 'move', id: hit.id, start: at, original: area.shape, before: s.areas, moved: false }
        return
      }
      claim(e)
      if (s.tool === 'shape') {
        const anchor = p.toLngLat(at)
        gesture.current = { kind: 'shape', shapeKind: s.shapeKind, anchor }
        setGhost(null)
        setDraft({ tool: 'shape', kind: s.shapeKind, anchor, to: at, square: e.shiftKey })
      } else if (s.tool === 'lasso') {
        const points = [p.toLngLat(at)]
        gesture.current = { kind: 'lasso', points }
        setDraft({ tool: 'lasso', points })
      } else if (s.tool === 'path') {
        const d = s.draft?.tool === 'path' ? s.draft : null
        if (d && d.points.length > 2) {
          const [fx, fy] = p.toScreen(d.points[0])
          if (Math.hypot(at[0] - fx, at[1] - fy) < 14) return actions.current.closePath()
        }
        setDraft({ tool: 'path', points: [...(d?.points ?? []), p.toLngLat(at)], cursor: at, near: false })
      }
    }

    const onMove = (e: PointerEvent) => {
      const g = gesture.current
      const at = local(e)
      if (g) {
        const s = live.current
        if (g.kind === 'move' || g.kind === 'handle') {
          let next: AreaShape | null
          if (g.kind === 'move') {
            const offset: ScreenPoint = [at[0] - g.start[0], at[1] - g.start[1]]
            if (!g.moved && Math.hypot(offset[0], offset[1]) < 2) return
            next = translate(g.original, offset, p)
          } else {
            next = dragHandle(g.original, g.handle, at, p)
          }
          if (!next) return
          g.moved = true
          const shape = next
          actions.current.write(s.areas.map((a) => (a.id === g.id ? { ...a, shape } : a)))
        } else if (g.kind === 'shape') {
          setDraft((d) => (d?.tool === 'shape' ? { ...d, to: at, square: e.shiftKey } : d))
        } else if (g.kind === 'lasso') {
          g.points.push(p.toLngLat(at))
          setDraft({ tool: 'lasso', points: g.points.slice() })
        } else if (g.kind === 'bar') {
          const bar = barRef.current
          const w = bar?.offsetWidth ?? 0
          const h = bar?.offsetHeight ?? 0
          setBarPos([
            Math.max(6, Math.min(container.clientWidth - w - 6, at[0] - g.offset[0])),
            Math.max(6, Math.min(container.clientHeight - h - 6, at[1] - g.offset[1])),
          ])
        } else if (g.kind === 'card') {
          setCardOffsets((all) => ({
            ...all,
            [g.id]: [g.origin[0] + at[0] - g.start[0], g.origin[1] + at[1] - g.start[1]],
          }))
        }
        return
      }
      if (!onGround(e.target)) {
        // over the toolbar or the card: no ghost behind them, nothing hovered under them
        setGhost(null)
        setHover(null)
        return
      }
      const s = live.current
      if (s.tool === 'select' && !s.spaceHeld) {
        const hit = hitTest(at)
        setHover((h) => (handleKey(h) === handleKey(hit) ? h : hit))
      } else if (s.tool === 'shape') {
        setGhost(at)
      } else if (s.tool === 'path' && s.draft?.tool === 'path') {
        const [fx, fy] = p.toScreen(s.draft.points[0])
        const near = s.draft.points.length > 2 && Math.hypot(at[0] - fx, at[1] - fy) < 14
        setDraft((d) => (d?.tool === 'path' ? { ...d, cursor: near ? [fx, fy] : at, near } : d))
      }
    }

    const onUp = (e: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      gesture.current = null
      const at = local(e)
      if (g.kind === 'empty') {
        // a click on bare ground deselects; a drag was the map panning
        if (Math.hypot(at[0] - g.start[0], at[1] - g.start[1]) < 4) setSelectedId(null)
        return
      }
      actions.current.releasePan()
      if (g.kind === 'move' || g.kind === 'handle') {
        if (g.moved) {
          actions.current.record(g.before)
          setCardSettled((n) => n + 1)
        }
      } else if (g.kind === 'shape') {
        const start = p.toScreen(g.anchor)
        const shape = shapeFromScreen(g.shapeKind, start, at, e.shiftKey, p)
        const clicked = Math.hypot(at[0] - start[0], at[1] - start[1]) < 7
        actions.current.commit(clicked ? clearOfBar(shape, p, barRef.current, container) : shape)
      } else if (g.kind === 'lasso') {
        const ring = simplify(g.points.map(p.toScreen), 11)
        if (ring.length >= 3 && g.points.length > 4) {
          actions.current.commit({ kind: 'polygon', freehand: true, ring: ring.map(p.toLngLat) })
        } else {
          setDraft(null)
        }
      }
    }

    // the browser took the pointer back (a system gesture, an interruption): not a release, and
    // its coordinates are not where the finger was
    const onCancel = () => {
      actions.current.cancelGesture()
    }
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.stopPropagation()
    }
    const onDoubleClick = (e: MouseEvent) => {
      if (live.current.draft?.tool !== 'path') return
      e.preventDefault()
      e.stopPropagation()
      actions.current.closePath()
    }
    const onLeave = () => {
      setGhost(null)
      setHover(null)
    }

    container.addEventListener('pointerdown', onDown, true)
    container.addEventListener('click', onClick, true)
    container.addEventListener('dblclick', onDoubleClick, true)
    container.addEventListener('pointerleave', onLeave)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      container.removeEventListener('pointerdown', onDown, true)
      container.removeEventListener('click', onClick, true)
      container.removeEventListener('dblclick', onDoubleClick, true)
      container.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    const container = map.getContainer()
    // The keys are the map's only while it is in use — the pointer over it or focus inside
    // it — so Backspace on a row elsewhere on the page never deletes an area.
    let pointerOver = false
    const enter = () => {
      pointerOver = true
    }
    const leave = () => {
      pointerOver = false
    }
    const editable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('[role="menu"],[role="dialog"]'))
    const onKeyDown = (e: KeyboardEvent) => {
      if (editable(e.target)) return
      if (!pointerOver && !container.contains(document.activeElement)) return
      const s = live.current
      const a = actions.current
      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey
      if (mod && key === 'z') {
        e.preventDefault()
        return e.shiftKey ? a.redo() : a.undo()
      }
      if (mod && key === 'y') {
        e.preventDefault()
        return a.redo()
      }
      if (mod && key === 'd') {
        if (s.selectedId) {
          e.preventDefault()
          a.duplicate()
        }
        return
      }
      if (mod || e.altKey) return
      if (e.key === ' ') {
        // hold Space to pan with any tool — but a focused button keeps Space for itself
        if (e.target instanceof HTMLButtonElement) return
        e.preventDefault()
        if (!e.repeat) setSpaceHeld(true)
        return
      }
      if (e.shiftKey && e.code === 'Digit1') return a.zoomToFit()
      if (key === '?' || (e.shiftKey && e.code === 'Slash')) return setKeysOpen((o) => !o)
      if (e.key === 'Escape') {
        if (s.keysOpen) return setKeysOpen(false)
        if (a.cancelGesture()) return
        if (s.draft) return setDraft(null)
        if (s.selectedId) return setSelectedId(null)
        if (s.dockOpen) return a.openDock(false)
        return
      }
      if (e.key === 'Enter') return a.closePath()
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const d = s.draft
        if (d?.tool === 'path') {
          e.preventDefault()
          return setDraft(d.points.length > 1 ? { ...d, points: d.points.slice(0, -1) } : null)
        }
        if (s.selectedId) {
          e.preventDefault()
          a.removeSelected()
        }
        return
      }
      if (e.shiftKey) return
      const shape = ({ r: 'rect', o: 'circle', g: 'pentagon' } as const)[key as 'r' | 'o' | 'g']
      if (shape) {
        setShapeKind(shape)
        return a.changeTool('shape')
      }
      const next = ({ v: 'select', h: 'pan', s: 'shape', p: 'path', l: 'lasso' } as const)[
        key as 'v' | 'h' | 's' | 'p' | 'l'
      ]
      if (next) return a.changeTool(next)
      if (key === 'a') return a.toggleAsk()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false)
    }
    // a Space released in another window never sends its keyup here
    const release = () => setSpaceHeld(false)
    container.addEventListener('pointerover', enter)
    container.addEventListener('pointerleave', leave)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', release)
    return () => {
      container.removeEventListener('pointerover', enter)
      container.removeEventListener('pointerleave', leave)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', release)
    }
  }, [map])

  if (!map) return null
  const h = history.current
  const endInset = narrow ? 0 : endCover
  const rtl = getComputedStyle(map.getContainer()).direction === 'rtl'

  return createPortal(
    <TooltipProvider delayDuration={300}>
      <div
        className="pointer-events-none absolute inset-0 font-sans text-sm text-foreground"
        style={{ zIndex: map.overlayZIndex ?? 2 }}
      >
        <Overlay
          map={map}
          points={points}
          index={index}
          areas={areas}
          selected={selected}
          insideSelected={insideSelected}
          hover={hover}
          tool={tool}
          shapeKind={shapeKind}
          style={style}
          draft={draft}
          ghost={ghost}
          pointLabel={pointLabel}
          average={selected && metric && scopeSummary.average !== null ? formatValue(metric, scopeSummary.average) : null}
          size={size}
          dockInset={(dockOpen ? dockWidth : 0) + endInset}
          rtl={rtl}
          barRef={barRef}
          cardOffset={(selected && cardOffsets[selected.id]) || [0, 0]}
          cardSettled={cardSettled}
          question={(selected && questions[selected.id]) || ''}
          // the agent's chat opens on the agent's own starters, and nothing is stacked around
          // it — so the area's questions sit here
          suggestions={suggestions}
          onQuestion={(value) => selected && setQuestions((all) => ({ ...all, [selected.id]: value }))}
          onAsk={(q) => selected && ask(q, selected.id)}
          onDelete={removeSelected}
          onCardDragStart={([clientX, clientY]) => {
            if (!selected) return
            const host = map.getContainer().getBoundingClientRect()
            gesture.current = {
              kind: 'card',
              id: selected.id,
              start: [clientX - host.left, clientY - host.top],
              origin: cardOffsets[selected.id] ?? [0, 0],
            }
          }}
        />
        <div
          className="absolute flex justify-center"
          style={
            barPos
              ? { left: barPos[0], top: barPos[1] }
              : { top: barTop, insetInlineStart: 0, insetInlineEnd: (dockOpen && !narrow ? DOCK_WIDTH + 24 : 0) + endInset }
          }
        >
          <Toolbar
            barRef={barRef}
            tool={tool}
            shapeKind={shapeKind}
            style={style}
            colors={palette}
            canUndo={h.undo.length > 0}
            canRedo={h.redo.length > 0}
            hasSelection={!!selected}
            dockOpen={dockOpen}
            onTool={changeTool}
            onShape={(kind) => {
              setShapeKind(kind)
              changeTool('shape')
            }}
            onStyle={applyStyle}
            onDock={toggleAsk}
            onUndo={undo}
            onRedo={redo}
            onDelete={removeSelected}
            onGripDown={(e) => {
              const bar = barRef.current
              if (!bar) return
              e.preventDefault()
              const r = bar.getBoundingClientRect()
              gesture.current = { kind: 'bar', offset: [e.clientX - r.left, e.clientY - r.top] }
            }}
            onGripReset={() => setBarPos(null)}
          />
        </div>
        {keysOpen && <KeysSheet onClose={() => setKeysOpen(false)} />}
        {agentId && (
          <Dock
            open={dockOpen}
            width={dockWidth}
            top={dockTop}
            endInset={endInset}
            agentId={agentId}
            runtimeContext={runtimeContext}
            scope={scope}
            pointLabel={pointLabel}
            sendRef={sendRef}
            onClose={closeDock}
          />
        )}
      </div>
    </TooltipProvider>,
    map.getContainer(),
  )
}

/* ---- overlay: everything that sits ON the map and moves with it ------------------------- */

type OverlayProps<P extends AreaPoint> = {
  map: AreaToolsMap
  points: readonly P[]
  index: PointIndex
  areas: MapArea[]
  selected: MapArea | null
  insideSelected: number[] | null
  hover: { id: string; handle?: Handle } | null
  tool: Tool
  shapeKind: ShapeKind
  style: AreaStyle
  draft: Draft | null
  ghost: ScreenPoint | null
  pointLabel: { one: string; other: string }
  /** the selected area's average, formatted — null without a metric */
  average: string | null
  size: { width: number; height: number }
  dockInset: number
  rtl: boolean
  barRef: RefObject<HTMLDivElement | null>
  cardOffset: [number, number]
  cardSettled: number
  question: string
  suggestions: string[]
  onQuestion: (value: string) => void
  onAsk: (question: string) => void
  onDelete: () => void
  /** client coordinates of the pointer that grabbed the card */
  onCardDragStart: (client: [number, number]) => void
}

function pathOf(ring: readonly ScreenPoint[], closed = true): string {
  return ring.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('') + (closed ? 'Z' : '')
}

function Overlay<P extends AreaPoint>(props: OverlayProps<P>) {
  const { map, points, index, areas, selected, insideSelected, hover, tool, draft, ghost, pointLabel } = props
  // The overlay redraws on the map's own move events — pan, zoom, rotate, resize, flyTo.
  const [, setView] = useState(0)
  useEffect(() => {
    const redraw = () => setView((v) => v + 1)
    map.on('move', redraw)
    map.on('resize', redraw)
    return () => {
      map.off('move', redraw)
      map.off('resize', redraw)
    }
  }, [map])
  const p = projector(map)

  const draftShape = useMemo((): AreaShape | null => {
    if (!draft) return null
    if (draft.tool === 'shape') return shapeFromScreen(draft.kind, p.toScreen(draft.anchor), draft.to, draft.square, p)
    if (draft.tool === 'path') {
      const ring = draft.cursor ? [...draft.points, p.toLngLat(draft.cursor)] : draft.points
      return ring.length >= 3 ? { kind: 'polygon', ring } : null
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])
  const countedDraft = useDeferredValue(draftShape)
  const draftCount = useMemo(() => (countedDraft ? index.inside(countedDraft).length : 0), [index, countedDraft])

  const barBottom = (() => {
    const bar = props.barRef.current
    const host = map.getContainer().getBoundingClientRect()
    return bar ? bar.getBoundingClientRect().bottom - host.top + 8 : 64
  })()

  return (
    <>
      <svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        {areas.map((area) => {
          const ring = screenRing(area.shape, p)
          const isHover = tool === 'select' && hover?.id === area.id && area.id !== selected?.id
          return (
            <path
              key={area.id}
              d={pathOf(ring)}
              style={ink(area.style.color)}
              fillOpacity={area.style.fill / 100}
              strokeWidth={area.style.stroke + (isHover ? 1.5 : 0)}
              strokeDasharray={area.style.dashed ? '6 5' : undefined}
              strokeLinejoin="round"
            />
          )
        })}
        {selected && insideSelected && insideSelected.length <= RING_LIMIT &&
          insideSelected.map((i) => {
            const [x, y] = p.toScreen([points[i].lng, points[i].lat])
            return (
              <circle key={i} cx={x} cy={y} r={12.5} style={line(selected.style.color)} strokeWidth={2} strokeOpacity={0.75} />
            )
          })}
        {selected && tool === 'select' && <Handles area={selected} p={p} />}
        {draft && <DraftShape draft={draft} shape={draftShape} color={props.style.color} p={p} />}
        {!draft && tool === 'shape' && ghost && (
          <path
            d={pathOf(
              screenRing(
                clearOfBar(shapeFromScreen(props.shapeKind, ghost, ghost, false, p), p, props.barRef.current, map.getContainer()),
                p,
              ),
            )}
            style={ink(props.style.color)}
            fillOpacity={0.06}
            strokeOpacity={0.42}
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />
        )}
      </svg>
      <DraftChip draft={draft} shape={draftShape} count={draftCount} pointLabel={pointLabel} p={p} />
      {selected && tool === 'select' && (
        <AreaCard
          area={selected}
          ring={screenRing(selected.shape, p)}
          count={insideSelected?.length ?? 0}
          average={props.average}
          pointLabel={pointLabel}
          size={props.size}
          dockInset={props.dockInset}
          rtl={props.rtl}
          barBottom={barBottom}
          offset={props.cardOffset}
          settled={props.cardSettled}
          question={props.question}
          suggestions={props.suggestions}
          onQuestion={props.onQuestion}
          onAsk={props.onAsk}
          onDelete={props.onDelete}
          onDragStart={props.onCardDragStart}
        />
      )}
    </>
  )
}

function Handles({ area, p }: { area: MapArea; p: Projector }) {
  const color = area.style.color
  return (
    <>
      {area.shape.kind === 'circle' &&
        (() => {
          const [cx, cy] = p.toScreen(area.shape.center)
          return <circle cx={cx} cy={cy} r={3.2} style={{ fill: color }} />
        })()}
      {handlesOf(area.shape, p).map(({ handle, at }, i) => (
        <circle key={i} cx={at[0]} cy={at[1]} r={handle.type === 'vertex' ? 4.2 : 5} style={knockout(color)} strokeWidth={2} />
      ))}
    </>
  )
}

function DraftShape({ draft, shape, color, p }: { draft: Draft; shape: AreaShape | null; color: string; p: Projector }) {
  if (draft.tool === 'shape') {
    if (!shape) return null
    return <path d={pathOf(screenRing(shape, p))} style={ink(color)} fillOpacity={0.14} strokeWidth={2} strokeDasharray="6 5" />
  }
  const placed = draft.points.map(p.toScreen)
  if (draft.tool === 'lasso') {
    return (
      <>
        {placed.length > 2 && <path d={pathOf(placed)} style={{ fill: color }} fillOpacity={0.1} stroke="none" />}
        <path d={pathOf(placed, false)} style={line(color)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </>
    )
  }
  const withCursor = draft.cursor ? [...placed, draft.cursor] : placed
  const last = placed[placed.length - 1]
  return (
    <>
      {withCursor.length > 2 && <path d={pathOf(withCursor)} style={{ fill: color }} fillOpacity={0.1} stroke="none" />}
      <path d={pathOf(placed, false)} style={line(color)} strokeWidth={2} strokeLinejoin="round" />
      {draft.cursor && last && (
        <line x1={last[0]} y1={last[1]} x2={draft.cursor[0]} y2={draft.cursor[1]} style={{ stroke: color }} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
      )}
      {placed.map(([x, y], i) =>
        i === 0 && draft.near ? (
          <g key={i}>
            <circle cx={x} cy={y} r={11} style={line(color)} strokeWidth={1.4} strokeOpacity={0.45} />
            <circle cx={x} cy={y} r={6.4} style={{ fill: color, stroke: KNOCKOUT }} strokeWidth={2.4} />
          </g>
        ) : (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 6 : 4.2} style={knockout(color)} strokeWidth={i === 0 ? 2.8 : 2} />
        ),
      )}
    </>
  )
}

function Chip({ at, children }: { at: ScreenPoint; children: ReactNode }) {
  return (
    <div
      className="absolute rounded-full bg-foreground px-2.5 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md"
      style={{ left: at[0], top: at[1] }}
    >
      {children}
    </div>
  )
}

/** One readout while drawing, never two. */
function DraftChip({
  draft,
  shape,
  count,
  pointLabel,
  p,
}: {
  draft: Draft | null
  shape: AreaShape | null
  count: number
  pointLabel: { one: string; other: string }
  p: Projector
}) {
  if (!draft || draft.tool === 'lasso') return null
  const inside = <span className="opacity-60"> · </span>
  if (draft.tool === 'path') {
    if (!draft.points.length) return null
    if (draft.near) {
      const [x, y] = p.toScreen(draft.points[0])
      return <Chip at={[x + 18, y - 30]}>Close shape</Chip>
    }
    const at = draft.cursor ?? p.toScreen(draft.points[draft.points.length - 1])
    const n = draft.points.length
    return (
      <Chip at={[at[0] + 18, at[1] - 30]}>
        {n} {n === 1 ? 'pt' : 'pts'}
        {inside}
        {plural(count, pointLabel)}
      </Chip>
    )
  }
  if (!shape) return null
  const box = screenBox(screenRing(shape, p))
  let dims: string
  if (shape.kind === 'circle') dims = `${formatMiles(shape.radiusMeters)} radius`
  else {
    const [west, south, east, north] = boundsOf(outline(shape))
    const mid = (south + north) / 2
    const width = distanceMeters([west, mid], [east, mid])
    const height = distanceMeters([west, south], [west, north])
    dims = `${formatMiles(width).replace(' mi', '')} × ${formatMiles(height)}`
  }
  return (
    <Chip at={[(box.left + box.right) / 2 - 60, box.bottom + 12]}>
      {dims}
      {inside}
      {plural(count, pointLabel)}
    </Chip>
  )
}

function ShapeGlyph({ kind, color, className }: { kind: AreaShape['kind'] | ShapeKind; color: string; className?: string }) {
  const common = { style: ink(color), fillOpacity: 0.2, strokeWidth: 1.6, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn('size-4 shrink-0', className)}>
      {kind === 'circle' ? (
        <circle cx="8" cy="8" r="6.1" {...common} />
      ) : kind === 'rect' ? (
        <rect x="1.9" y="1.9" width="12.2" height="12.2" rx="2.4" {...common} />
      ) : (
        <path d="M8 1.7 14 6.06 11.71 13.1H4.29L2 6.06Z" {...common} />
      )}
    </svg>
  )
}

/* ---- the card under a selected area -------------------------------------------------------- */

function AreaCard({
  area,
  ring,
  count,
  average,
  pointLabel,
  size,
  dockInset,
  rtl,
  barBottom,
  offset,
  settled,
  question,
  suggestions,
  onQuestion,
  onAsk,
  onDelete,
  onDragStart,
}: {
  area: MapArea
  ring: ScreenPoint[]
  count: number
  average: string | null
  pointLabel: { one: string; other: string }
  size: { width: number; height: number }
  dockInset: number
  rtl: boolean
  barBottom: number
  offset: [number, number]
  settled: number
  question: string
  suggestions: string[]
  onQuestion: (value: string) => void
  onAsk: (question: string) => void
  onDelete: () => void
  onDragStart: (client: [number, number]) => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  // the field starts at two lines and grows to six, then scrolls — sized before the card is
  // measured below, or the card is placed for the height it had a keystroke ago
  useLayoutEffect(() => {
    const ta = textRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(108, Math.max(36, ta.scrollHeight))}px`
    ta.style.overflowY = ta.scrollHeight > 109 ? 'auto' : 'hidden'
  }, [question])
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight
    if (h && h !== height) setHeight(h)
  })

  // Clear of its shape, plus whatever the user dragged it by, kept inside the map. The side is
  // chosen once, from the card's measured height, and kept while the card grows or the shape
  // moves — choosing again then sends the card across the shape under the pointer.
  const width = Math.min(CARD_WIDTH, size.width - 16)
  const room = {
    left: rtl ? dockInset + 8 : 8,
    right: rtl ? size.width - 8 : size.width - dockInset - 8,
    top: barBottom,
    bottom: size.height - 8,
  }
  const key = `${area.id}:${settled}:${room.left}:${room.right}:${room.top}:${room.bottom}`
  const chosen = useRef<{ key: string; side: CardSide } | null>(null)
  const keep = chosen.current?.key === key ? chosen.current.side : undefined
  const cardHeight = height ?? 150
  const at = placeCard(screenBox(ring), { width, height: cardHeight }, room, keep)
  useLayoutEffect(() => {
    if (height !== null && !keep) chosen.current = { key, side: at.side }
  })
  const left = Math.max(room.left, Math.min(room.right - width, at.left + offset[0]))
  const top = Math.max(room.top, Math.min(room.bottom - cardHeight, at.top + offset[1]))
  const meta = `${plural(count, pointLabel)}${count && average !== null ? ` · avg ${average}` : ''}`

  return (
    <div
      ref={cardRef}
      className="pointer-events-auto absolute rounded-xl border bg-popover text-popover-foreground shadow-xl"
      style={{ left, top, width }}
    >
      <div
        className="flex cursor-grab items-center gap-2 px-3 pt-2.5 pb-2 select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          onDragStart([e.clientX, e.clientY])
        }}
      >
        <ShapeGlyph kind={area.shape.kind} color={area.style.color} />
        <span className="font-semibold">{area.name}</span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
        <span className="flex-1" />
        <IconButton label="Delete this area" keys="⌫" onClick={onDelete} className="hover:text-destructive">
          <Trash2 />
        </IconButton>
      </div>
      <form
        className="mx-2 mb-2 rounded-lg bg-muted"
        onSubmit={(e) => {
          e.preventDefault()
          onAsk(question)
        }}
      >
        <textarea
          ref={textRef}
          rows={1}
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onAsk(question)
            }
          }}
          placeholder="Ask the agent about this area…"
          className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex justify-end p-1.5">
          <button
            type="submit"
            aria-label="Send"
            disabled={!question.trim()}
            className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:bg-transparent disabled:text-muted-foreground [&_svg]:size-4"
          >
            <ArrowUp />
          </button>
        </div>
      </form>
      {suggestions.length > 0 && !question && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-2.5">
          {suggestions.slice(0, 3).map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onAsk(s)}
              className="rounded-full border px-2.5 py-1 text-start text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---- toolbar ------------------------------------------------------------------------------- */

function IconButton({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string
  keys?: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
        pressed ? 'bg-background text-foreground shadow-sm' : 'hover:bg-background/60',
        className,
      )}
    >
      {children}
    </button>
  )
  if (disabled) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
        {keys && <kbd className="rounded bg-background/20 px-1 font-sans text-[10px]">{keys}</kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

const Separator = () => <span className="mx-0.5 h-5 w-px bg-border" />

type ToolbarProps = {
  barRef: RefObject<HTMLDivElement | null>
  tool: Tool
  shapeKind: ShapeKind
  style: AreaStyle
  colors: readonly AreaColor[]
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  dockOpen: boolean
  onTool: (tool: Tool) => void
  onShape: (kind: ShapeKind) => void
  onStyle: (patch: Partial<AreaStyle>) => void
  onDock: () => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onGripDown: (e: ReactPointerEvent) => void
  onGripReset: () => void
}

function Toolbar(props: ToolbarProps) {
  const { tool, shapeKind, style } = props
  const current = SHAPES.find((s) => s.kind === shapeKind)!
  const colorName = props.colors.find((c) => c.color === style.color)?.name ?? 'Custom'
  return (
    <div
      ref={props.barRef}
      className="pointer-events-auto flex items-center gap-0.5 rounded-2xl border bg-muted/95 p-1 shadow-lg backdrop-blur"
      role="toolbar"
      aria-label="Map tools"
    >
      <span
        aria-label="Drag to move the toolbar"
        title="Drag to move · double-click to reset"
        className="flex h-8 w-5 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing [&_svg]:size-4"
        onPointerDown={props.onGripDown}
        onDoubleClick={props.onGripReset}
      >
        <GripVertical />
      </span>
      <IconButton label="Select" keys="V" pressed={tool === 'select'} onClick={() => props.onTool('select')}>
        <MousePointer2 />
      </IconButton>
      <IconButton label="Pan the map" keys="H" pressed={tool === 'pan'} onClick={() => props.onTool('pan')}>
        <Hand />
      </IconButton>
      <Separator />
      <span className={cn('flex items-center rounded-lg', tool === 'shape' && 'bg-background shadow-sm')}>
        <IconButton label={current.label} keys={current.key} pressed={false} onClick={() => props.onShape(shapeKind)}>
          <current.Icon className={cn(tool === 'shape' && 'text-foreground')} />
        </IconButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Pick a shape"
            className="inline-flex h-8 w-5 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          >
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" sideOffset={8} className="w-44">
            {SHAPES.map(({ kind, label, key, Icon }) => (
              <DropdownMenuItem key={kind} onSelect={() => props.onShape(kind)}>
                <Icon />
                <span className="flex-1">{label}</span>
                <kbd className="text-xs text-muted-foreground">{key}</kbd>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
      <IconButton label="Polygon by points" keys="P" pressed={tool === 'path'} onClick={() => props.onTool('path')}>
        <VectorSquare />
      </IconButton>
      <IconButton label="Lasso — freehand area" keys="L" pressed={tool === 'lasso'} onClick={() => props.onTool('lasso')}>
        <Lasso />
      </IconButton>
      <Separator />
      <Popover>
        <PopoverTrigger
          aria-label={`Colour — ${colorName}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-muted-foreground hover:bg-background/60 hover:text-foreground [&_svg]:size-3.5"
        >
          <span className="size-4 rounded-full border border-black/10" style={{ background: style.color }} />
          <ChevronDown />
        </PopoverTrigger>
        <PopoverContent align="center" sideOffset={8} className="w-64 space-y-4">
          <StyleRow title="Colour">
            <div className="flex flex-wrap gap-2">
              {props.colors.map((c) => (
                <button
                  key={c.color}
                  type="button"
                  aria-label={c.name}
                  aria-pressed={c.color === style.color}
                  onClick={() => props.onStyle({ color: c.color })}
                  className={cn('size-7 rounded-md', c.color === style.color && 'outline-2 outline-offset-2')}
                  style={{ background: c.color, outlineColor: c.color }}
                />
              ))}
            </div>
          </StyleRow>
          <StyleRow title="Fill">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={style.fill}
                aria-label="Fill opacity"
                onChange={(e) => props.onStyle({ fill: Number(e.target.value) })}
                className="h-1.5 flex-1 cursor-pointer accent-foreground"
              />
              <span className="w-9 text-end text-xs text-muted-foreground tabular-nums">{style.fill}%</span>
            </div>
          </StyleRow>
          <StyleRow title="Stroke">
            <Segmented
              value={String(style.stroke)}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '4', label: '4' },
              ]}
              onChange={(v) => props.onStyle({ stroke: Number(v) as AreaStyle['stroke'] })}
            />
          </StyleRow>
          <StyleRow title="Line">
            <Segmented
              value={style.dashed ? 'dashed' : 'solid'}
              options={[
                { value: 'solid', label: <span className="block h-px w-8 bg-current" />, aria: 'Solid' },
                {
                  value: 'dashed',
                  label: <span className="block h-px w-8 bg-[repeating-linear-gradient(90deg,currentColor_0_6px,transparent_6px_10px)]" />,
                  aria: 'Dashed',
                },
              ]}
              onChange={(v) => props.onStyle({ dashed: v === 'dashed' })}
            />
          </StyleRow>
        </PopoverContent>
      </Popover>
      <Separator />
      <IconButton label="Ask the agent" keys="A" pressed={props.dockOpen} onClick={props.onDock}>
        <MessageSquarePlus />
      </IconButton>
      <Separator />
      <IconButton label="Undo" keys={`${MOD}Z`} disabled={!props.canUndo} onClick={props.onUndo}>
        <Undo2 />
      </IconButton>
      <IconButton label="Redo" keys={`⇧${MOD}Z`} disabled={!props.canRedo} onClick={props.onRedo}>
        <Redo2 />
      </IconButton>
      <IconButton label="Delete" keys="⌫" disabled={!props.hasSelection} onClick={props.onDelete}>
        <Eraser />
      </IconButton>
    </div>
  )
}

function StyleRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      {children}
    </div>
  )
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: ReactNode; aria?: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-label={o.aria}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-7 flex-1 items-center justify-center rounded-md text-xs text-muted-foreground',
            o.value === value && 'bg-background text-foreground shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

const KEYS: [string, [string, string][]][] = [
  ['Tools', [['Select', 'V'], ['Pan the map', 'H'], ['Rectangle', 'R'], ['Circle', 'O'], ['Pentagon', 'G'], ['Polygon', 'P'], ['Lasso', 'L']]],
  ['While drawing', [['Close the shape', '⏎'], ['Cancel', 'Esc'], ['Square', '⇧'], ['Remove last point', '⌫'], ['Pan', 'Space']]],
  ['Selection', [['Ask the agent', 'A'], ['Duplicate', `${MOD}D`], ['Delete', '⌫'], ['Deselect', 'Esc']]],
  ['Map', [['Undo', `${MOD}Z`], ['Redo', `⇧${MOD}Z`], ['Zoom to fit', '⇧1'], ['This sheet', '?']]],
]

function KeysSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute top-16 left-1/2 w-[30rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold">Map tools — keyboard</p>
        <IconButton label="Close" keys="Esc" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
        {KEYS.map(([section, rows]) => (
          <div key={section} className="mb-2">
            <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{section}</p>
            {rows.map(([label, key]) => (
              <div key={label} className="flex justify-between py-0.5 text-sm">
                <span>{label}</span>
                <kbd className="rounded bg-muted px-1.5 font-sans text-xs text-muted-foreground">{key}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---- the agent panel ------------------------------------------------------------------------- */

type DockProps = {
  open: boolean
  width: number
  /** below whatever header the app lays over the map's top edge */
  top: number
  /** beside whatever drawer the app lays down the map's end edge */
  endInset: number
  agentId: string
  runtimeContext: Record<string, unknown>
  scope: { name: string; color: string; kind: AreaShape['kind']; count: number } | null
  pointLabel: { one: string; other: string }
  sendRef: RefObject<((message: string) => void) | null>
  onClose: () => void
}

// Memoised: the map redraws dozens of times a second while it moves, and none of that
// reaches the conversation.
const Dock = memo(function Dock(props: DockProps) {
  const { open, scope } = props
  return (
    <aside
      aria-label="Agent"
      aria-hidden={!open}
      className={cn(
        'pointer-events-auto absolute bottom-0 flex flex-col border-s bg-background shadow-xl transition-transform',
        !open && 'invisible translate-x-full rtl:-translate-x-full',
      )}
      style={{ top: props.top, insetInlineEnd: props.endInset, width: props.width }}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className="font-semibold">Agent</span>
        <span className="flex-1" />
        {scope && (
          <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
            <ShapeGlyph kind={scope.kind} color={scope.color} className="size-3.5" />
            <span className="truncate font-medium">{scope.name}</span>
            <span className="text-muted-foreground">{plural(scope.count, props.pointLabel)}</span>
          </span>
        )}
        <IconButton label="Close the agent" keys="A" onClick={props.onClose}>
          <X />
        </IconButton>
      </header>
      <Suspense fallback={<div className="flex-1 animate-pulse bg-muted/40" />}>
        <AreaCopilot
          agentId={props.agentId}
          runtimeContext={props.runtimeContext}
          // the copilot reads its placeholder once, at mount — so one that fits both scopes
          placeholder="Ask about the selected area, or the whole map…"
          sendRef={props.sendRef}
        />
      </Suspense>
    </aside>
  )
})
