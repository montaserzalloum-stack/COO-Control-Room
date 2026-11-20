// The geometry behind <MapAreaTools>. Pure functions, no map instance: shapes are stored in
// lng/lat, and "inside" is decided in Web Mercator — the projection Mapbox and MapLibre
// draw in — so the count always agrees with the outline on screen. A polygon edge that is
// straight on the map is straight here; tested in raw lng/lat it would bow, and points
// near a long edge would land on the wrong side of it.

export type LngLat = [lng: number, lat: number]
export type ScreenPoint = [x: number, y: number]

export type AreaShape =
  | { kind: 'rect'; west: number; south: number; east: number; north: number }
  | { kind: 'circle'; center: LngLat; radiusMeters: number }
  | { kind: 'polygon'; ring: LngLat[]; freehand?: boolean }

export type AreaStyle = {
  /** any CSS colour — the outline and its tinted fill; a theme token such as `var(--primary)`
   * follows the app's theme */
  color: string
  /** fill opacity, 0-100 */
  fill: number
  stroke: 1 | 2 | 4
  dashed: boolean
}

export type MapArea = { id: string; name: string; shape: AreaShape; style: AreaStyle }

const EARTH_RADIUS_M = 6_371_008.8
export const METERS_PER_MILE = 1609.344
const MAX_MERCATOR_LAT = 85.051129

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Web Mercator in the unit square. */
export function mercator([lng, lat]: LngLat): ScreenPoint {
  const sin = Math.sin(rad(Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat))))
  return [(lng + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)]
}

/** Great-circle distance. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** The point `meters` from `from` along `bearing` (degrees clockwise from north). */
export function destination(from: LngLat, meters: number, bearing: number): LngLat {
  const d = meters / EARTH_RADIUS_M
  const t = rad(bearing)
  const lat1 = rad(from[1])
  const lng1 = rad(from[0])
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(t))
  const lng2 =
    lng1 +
    Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [((deg(lng2) + 540) % 360) - 180, deg(lat2)]
}

/** The ring the map draws for a shape. A circle is a geodesic ring, so a 300-mile radius
 * bends with the projection exactly as the distance test does. */
export function outline(shape: AreaShape, steps = 64): LngLat[] {
  if (shape.kind === 'rect') {
    const { west, south, east, north } = shape
    return [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ]
  }
  if (shape.kind === 'circle') {
    return Array.from({ length: steps }, (_, i) =>
      destination(shape.center, shape.radiusMeters, (i * 360) / steps),
    )
  }
  return shape.ring
}

export function boundsOf(ring: readonly LngLat[]): [west: number, south: number, east: number, north: number] {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of ring) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  return [west, south, east, north]
}

/** Even-odd ray cast — works on screen points and on Mercator points alike. */
export function inRing(x: number, y: number, ring: readonly ScreenPoint[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function segmentDistance(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const len = vx * vx + vy * vy
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len)) : 0
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}

/** Ramer-Douglas-Peucker. A freehand drag leaves hundreds of samples; this keeps the corners
 * that carry the silhouette, so the committed lasso has a handful of vertices instead of a
 * bead necklace. `tolerance` is in the same unit as the points (screen px). */
export function simplify(points: readonly ScreenPoint[], tolerance: number): ScreenPoint[] {
  if (points.length < 3) return points.slice()
  const keep = [0, points.length - 1]
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let far = -1
    let farDistance = tolerance
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last])
      if (d > farDistance) {
        farDistance = d
        far = i
      }
    }
    if (far > 0) {
      keep.push(far)
      stack.push([first, far], [far, last])
    }
  }
  return keep.sort((a, b) => a - b).map((i) => points[i])
}

/** A regular polygon around a screen point, first vertex straight up. */
export function regularPolygon(center: ScreenPoint, radius: number, sides: number): ScreenPoint[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides
    return [center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)] as ScreenPoint
  })
}

/**
 * Every point's position, flattened once into typed arrays so an area query over 10^5+
 * points is a tight loop. Each query is a bounding-box pass first: a small area over a
 * national network costs four comparisons per point, and only the few that survive pay
 * for the exact test.
 */
export class PointIndex {
  readonly size: number
  private readonly lng: Float64Array
  private readonly lat: Float64Array
  private readonly mx: Float64Array
  private readonly my: Float64Array

  constructor(points: readonly { lng: number; lat: number }[]) {
    this.size = points.length
    this.lng = new Float64Array(this.size)
    this.lat = new Float64Array(this.size)
    this.mx = new Float64Array(this.size)
    this.my = new Float64Array(this.size)
    for (let i = 0; i < this.size; i++) {
      const { lng, lat } = points[i]
      // a point with no usable position is in no area — NaN fails every comparison below
      const ok = Number.isFinite(lng) && Number.isFinite(lat)
      this.lng[i] = ok ? lng : NaN
      this.lat[i] = ok ? lat : NaN
      const [x, y] = ok ? mercator([lng, lat]) : [NaN, NaN]
      this.mx[i] = x
      this.my[i] = y
    }
  }

  /** Indices of the points inside `shape`, in input order. Points live in [-180, 180]; an
   * area drawn on a wrapped copy of the world comes back from the map with longitudes past
   * ±180, and one across the antimeridian straddles it — so the area is shifted onto the
   * points' world, and a point is also tried one world over on the side the area spills. */
  inside(shape: AreaShape): number[] {
    const out: number[] = []
    if (shape.kind === 'rect') {
      const shift = -360 * Math.round((shape.west + shape.east) / 2 / 360)
      const west = shape.west + shift
      const east = shape.east + shift
      const { south, north } = shape
      for (let i = 0; i < this.size; i++) {
        const lng = this.lng[i]
        const lat = this.lat[i]
        if (!(lat >= south && lat <= north)) continue
        if ((lng >= west && lng <= east) || (lng + 360 <= east && lng + 360 >= west) || (lng - 360 >= west && lng - 360 <= east)) {
          out.push(i)
        }
      }
      return out
    }
    if (shape.kind === 'circle') {
      const { center, radiusMeters } = shape
      const span = deg(radiusMeters / EARTH_RADIUS_M)
      const south = center[1] - span
      const north = center[1] + span
      // near a pole a circle can wrap every longitude, so only the latitude band filters
      const widest = Math.max(Math.abs(south), Math.abs(north))
      const lngSpan = widest < 89 ? span / Math.cos(rad(widest)) : Infinity
      for (let i = 0; i < this.size; i++) {
        const lat = this.lat[i]
        if (!(lat >= south && lat <= north)) continue
        // normalized first: an area on a far world copy has a center past +540, and % keeps the sign
        const dLng = Math.abs(((((this.lng[i] - center[0]) % 360) + 540) % 360) - 180)
        if (dLng > lngSpan) continue
        if (distanceMeters(center, [this.lng[i], lat]) <= radiusMeters) out.push(i)
      }
      return out
    }
    if (shape.ring.length < 3) return out
    const meanLng = shape.ring.reduce((sum, [lng]) => sum + lng, 0) / shape.ring.length
    const shift = -360 * Math.round(meanLng / 360)
    const ring = shape.ring.map(([lng, lat]) => mercator([lng + shift, lat]))
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    // one world is 1 in mercator x
    const tries = [0, ...(maxX > 1 ? [1] : []), ...(minX < 0 ? [-1] : [])]
    for (let i = 0; i < this.size; i++) {
      const y = this.my[i]
      if (!(y >= minY && y <= maxY)) continue
      for (const dx of tries) {
        const x = this.mx[i] + dx
        if (x >= minX && x <= maxX && inRing(x, y, ring)) {
          out.push(i)
          break
        }
      }
    }
    return out
  }

  /** The bounds of every positioned point, or null when there are none. */
  bounds(): [west: number, south: number, east: number, north: number] | null {
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (let i = 0; i < this.size; i++) {
      const lng = this.lng[i]
      const lat = this.lat[i]
      if (Number.isNaN(lng)) continue
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
    return west === Infinity ? null : [west, south, east, north]
  }
}

/** "3.4 mi" / "120 mi" — one decimal under ten miles, whole miles above. */
export function formatMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString()} mi`
}

export type ScreenBox = { left: number; top: number; right: number; bottom: number }
export type CardSide = 'below' | 'above' | 'after' | 'before' | 'over'

/** Where an area's card opens: under the shape, else over it, else beside it on the side with
 * more room, so it never lands on the outline it describes. Only a shape that leaves no room on
 * any side is covered, and the card can still be dragged off it. `room` is the part of the map
 * the card may use; `keep` holds a side already chosen instead of choosing again. */
export function placeCard(
  shape: ScreenBox,
  card: { width: number; height: number },
  room: ScreenBox,
  keep?: CardSide,
  gap = 22,
): { left: number; top: number; side: CardSide } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const x = (shape.left + shape.right) / 2 - card.width / 2
  const y = (shape.top + shape.bottom) / 2 - card.height / 2
  const sides: Record<CardSide, { left: number; top: number; fits: boolean }> = {
    below: { left: x, top: shape.bottom + gap, fits: shape.bottom + gap + card.height <= room.bottom },
    above: { left: x, top: shape.top - gap - card.height, fits: shape.top - gap - card.height >= room.top },
    after: { left: shape.right + gap, top: y, fits: shape.right + gap + card.width <= room.right },
    before: { left: shape.left - gap - card.width, top: y, fits: shape.left - gap - card.width >= room.left },
    over: { left: x, top: shape.bottom + gap, fits: true },
  }
  const roomierAfter = room.right - shape.right >= shape.left - room.left
  const order: CardSide[] = ['below', 'above', ...(roomierAfter ? (['after', 'before'] as const) : (['before', 'after'] as const)), 'over']
  const side = keep ?? order.find((s) => sides[s].fits) ?? 'over'
  const at = sides[side]
  return {
    side,
    left: clamp(at.left, room.left, room.right - card.width),
    top: clamp(at.top, room.top, room.bottom - card.height),
  }
}
