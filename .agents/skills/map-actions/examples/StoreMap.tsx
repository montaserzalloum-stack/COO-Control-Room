// A whole screen to copy and adapt: stores on a MapLibre map, with the area tools on top. On
// Mapbox GL the map lines change and <MapAreaTools> does not. Pick the basemap from `maps`.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MapAreaTools } from '@/components/map/MapAreaTools'

setWorkerUrl(workerUrl)

type Store = { id: string; name: string; lng: number; lat: number; attainment: number }

const STORE_AGENT = 'store_ops_copilot' // the id find_ai_agent returned — the `copilot` skill
const BASEMAP = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'

export function StoreMap({ stores }: { stores: Store[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [focus, setFocus] = useState<Store[]>([])

  useEffect(() => {
    const m = new MapLibreMap({
      container: ref.current!,
      style: {
        version: 8,
        sources: { base: { type: 'raster', tiles: [BASEMAP], tileSize: 256, attribution: 'Tiles © Esri' } },
        layers: [{ id: 'base', type: 'raster', source: 'base' }],
      },
      center: [-96, 38],
      zoom: 3.5,
    })
    m.on('load', () => setMap(m)) // hand it over once loaded, never before
    return () => m.remove()
  }, [])

  const data = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: stores.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        properties: { id: s.id, name: s.name },
      })),
    }),
    [stores],
  )

  // a GeoJSON circle layer, never a DOM marker per point
  useEffect(() => {
    if (!map) return
    const source = map.getSource<GeoJSONSource>('stores')
    if (source) return void source.setData(data)
    map.addSource('stores', { type: 'geojson', data })
    map.addLayer({
      id: 'stores',
      type: 'circle',
      source: 'stores',
      paint: { 'circle-radius': 5, 'circle-color': '#2563eb', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 },
    })
  }, [map, data])

  return (
    <div className="relative h-full">
      <div ref={ref} className="h-full w-full" />
      <MapAreaTools
        map={map}
        points={stores}
        pointLabel={{ one: 'store', other: 'stores' }}
        metric={{ label: 'Attainment', value: (s) => s.attainment, format: (v) => `${Math.round(v)}%` }}
        agentId={STORE_AGENT}
        suggestions={['Which stores here need attention?', 'How does this area compare with the rest?', 'Plan a visit route']}
        onSelectionChange={(_, inside) => setFocus(inside)}
      />
      {/* the screen's own overlays stay off the top edge and the end edge */}
      {focus.length > 0 && (
        <aside className="absolute start-4 bottom-4 rounded-md bg-background p-3 text-sm shadow">
          Lowest here: {[...focus].sort((a, b) => a.attainment - b.attainment)[0].name}
        </aside>
      )}
    </div>
  )
}
