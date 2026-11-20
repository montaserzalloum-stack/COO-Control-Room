import type { Plugin } from 'vite'
import { peerEntryName, type SdkConfig } from './uaSdkRuntime'

/**
 * Writes the `<!-- ua:sdk -->` block into the built `index.html`: a working import map, and a link
 * to the stylesheet its delivered entries are drawn with, which an import map cannot carry.
 *
 * There is no second half describing this app for a server to check against. Whatever a deploy
 * serves is what every app gets, so there is nothing to negotiate — a server either has a fresher
 * url for a key in this map or it does not.
 *
 * Placed immediately BEFORE the first module script rather than wherever the template's marker sat.
 * An import map has to be in the document before the first module load, and that is a property of
 * document ORDER — a marker that drifted below the entry script would produce a page that looks
 * correctly wired and resolves nothing.
 */
export function sdkBlockPlugin(
  config: SdkConfig,
  entryFor: (id: string) => string | null,
  peers: string[],
  externalized: ReadonlySet<string>,
): Plugin {
  let base = '/'

  return {
    name: 'ua-sdk-block',
    configResolved(resolved) {
      base = resolved.base
    },
    // Rewrites the EMITTED html rather than going through transformIndexHtml: vite relocates
    // `<script>` tags it finds during html processing, and it moved the import map out from
    // between the markers — correct for the browser, invisible to the server that has to find it
    // again. Editing the asset after vite is done is the only placement that stays put.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const html = htmlAssetOf(bundle)
        if (html === null) return

        const imports: Record<string, string> = {}
        const stylesheets = new Set<string>()

        // Every delivered specifier the build left external, static and dynamic alike. Read off the
        // resolver rather than the chunks: Vite 8's bundler lists no external a chunk imports
        // DYNAMICALLY (measured 2026-11-05), so `await import('@unifyapps/app-builder-sdk/…')` —
        // the way an app loads the chat — would get no key and fail as an unresolved specifier
        // when the user reaches that route, not at build time.
        for (const specifier of externalized) {
          const entry = entryFor(specifier) as string
          imports[specifier] = config.entries[entry] as string
          const stylesheet = config.needs?.[entry]?.stylesheet
          if (stylesheet !== undefined) stylesheets.add(stylesheet)
        }

        if (Object.keys(imports).length === 0) return // this app imports no delivered entry

        for (const specifier of peers) {
          const name = peerEntryName(specifier)
          const chunk = Object.values(bundle).find(
            (candidate) => candidate.type === 'chunk' && candidate.name === name,
          )
          if (chunk === undefined) {
            // Nothing can resolve the SDK's own `react` without this, so stop here rather than
            // emit a map that is missing a key.
            this.error(`[ua-sdk] no chunk was emitted for peer "${specifier}"`)
          }
          imports[specifier] = `${base}${chunk.fileName}`
        }

        const block = [
          '<!-- ua:sdk -->',
          `<script type="importmap">${JSON.stringify({ imports })}</script>`,
          ...[...stylesheets].map((href) => `<link rel="stylesheet" href="${href}">`),
          '<!-- /ua:sdk -->',
        ].join('')

        const withoutMarker = html.source.replace(/<!-- ua:sdk -->[\s\S]*?<!-- \/ua:sdk -->/, '')
        const firstModule = withoutMarker.search(/<script[^>]*type="module"/)
        html.asset.source =
          firstModule === -1
            ? withoutMarker.replace('</head>', () => `${block}</head>`)
            : withoutMarker.slice(0, firstModule) + block + withoutMarker.slice(firstModule)
      },
    },
  }
}

/** The single html asset a vite SPA build emits, with its source as text. */
function htmlAssetOf(bundle: Record<string, { type: string; fileName: string; source?: unknown }>) {
  for (const asset of Object.values(bundle)) {
    if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue
    return { asset: asset as { source: unknown }, source: String(asset.source) }
  }
  return null
}

