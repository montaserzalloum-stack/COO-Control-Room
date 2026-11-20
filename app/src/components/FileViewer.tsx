import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/esm/Page/AnnotationLayer.css'
import 'react-pdf/dist/esm/Page/TextLayer.css'
// eslint-disable-next-line import/default -- Vite's `?url` returns the worker file's URL as the default export; the linter doesn't parse the query suffix
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { renderAsync } from 'docx-preview'
import * as XLSX from 'xlsx'
import { AlertCircle, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// react-pdf's worker, bundled by Vite (?url) and version-pinned to react-pdf's OWN pdfjs-dist
// (4.8.69 — see package.json). The worker build version MUST equal the API version or pdf.js
// throws at load, which is why the two are pinned together. `<iframe>/<embed>/<object>` are
// deliberately NOT used for PDFs — Chrome blocks them inside the builder's sandboxed preview.
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// Cross-origin platform builds (preview/embedded) set VITE_ENTITY_API_BASE; there the session
// cookie must ride cross-site, so files are read with 'include'. A same-origin deploy sends
// 'same-origin'. One signal for BOTH the fetch path and react-pdf — matches lib/passwordPolicy.ts.
const API_BASE = import.meta.env.VITE_ENTITY_API_BASE || ''
const FETCH_CREDENTIALS: RequestCredentials = API_BASE ? 'include' : 'same-origin'

/**
 * THE prebuilt file viewer. Give it the URL of a file a record carries — the `file.url` an
 * upload returns once `status === 'success'`, or a stored file's url — and it renders it
 * correctly for every common format, or falls back to an honest download.
 *
 * IMPORT THIS. DO NOT author your own docx / xlsx / pdf / office viewer. Hand-rolled ones get
 * three things wrong, every time: they read the wrong bytes (a file is not a text field), they
 * dump raw ZIP bytes as text, or they invent slide/sheet content. This component owns exactly
 * those three:
 *   1. the AUTHENTICATED fetch of the real bytes (a platform file URL needs the session cookie),
 *   2. the real per-format renderers — react-pdf (pdf.js), docx-preview, SheetJS,
 *   3. an honest download card as the mandatory FLOOR: every format degrades to it on any error
 *      (Office — pptx/ppt/doc — and unknown types use it directly).
 *
 * It is ordinary app code. Restyle it with your own shadcn components, change the layout, drop
 * formats you don't need — but keep the two contracts: fetch the REAL bytes, and never replace
 * a renderer with a mock body or a raw-text dump.
 *
 *   <FileViewer url={file.url} name={file.name} mimeType={file.mimeType} />
 */
export interface FileViewerProps {
  /** storage URL of the file (an upload's `file.url`, or a stored file's url) */
  url: string
  /** file name — picks the renderer and labels the download */
  name: string
  mimeType?: string
  className?: string
}

type Kind = 'pdf' | 'docx' | 'sheet' | 'image' | 'text' | 'office' | 'unknown'

const EXT_KIND: Record<string, Kind> = {
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'sheet',
  xls: 'sheet',
  csv: 'sheet',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  avif: 'image',
  bmp: 'image',
  // an <img>-loaded SVG cannot run scripts, so it is safe to show without sanitising
  svg: 'image',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  json: 'text',
  log: 'text',
  xml: 'text',
  yml: 'text',
  yaml: 'text',
  // Office formats with no faithful client renderer → the honest download card
  pptx: 'office',
  ppt: 'office',
  doc: 'office',
}

function kindOf(name: string, mimeType?: string): Kind {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (EXT_KIND[ext]) return EXT_KIND[ext]
  if (mimeType?.startsWith('image/')) return 'image'
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType?.startsWith('text/')) return 'text'
  return 'unknown'
}

/** The shared FLOOR: a clear message + a REAL download. Every format falls back to it on a
 * fetch/render error; legacy Office (ppt/doc) and unknown types use it directly. Never a
 * blank panel, never a mock body. */
function DownloadCard({ url, name, note }: { url: string; name: string; note: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="bg-muted mx-auto mb-2 flex size-9 items-center justify-center rounded-md">
            <AlertCircle className="text-muted-foreground size-5" />
          </div>
          <CardTitle className="text-base">{note}</CardTitle>
          <CardDescription className="break-all">{name}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href={url} target="_blank" rel="noreferrer" download={name}>
              <Download className="size-4" /> Download
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function Loading() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}

/** A `data:` URI already carries its bytes, so decode it inline — fetching one would hit the
 * app's `connect-src` CSP (which does not list `data:`), the usual reason a seeded sample file
 * won't preview. Handles both base64 and percent-encoded payloads. */
function decodeDataUrl(dataUrl: string, as: 'array' | 'text'): ArrayBuffer | string {
  const comma = dataUrl.indexOf(',')
  const meta = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  if (/;base64/i.test(meta)) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return as === 'array' ? bytes.buffer : new TextDecoder().decode(bytes)
  }
  const text = decodeURIComponent(payload)
  return as === 'array' ? new TextEncoder().encode(text).buffer : text
}

/** Read the REAL bytes of a file — ArrayBuffer for binary formats, text for text formats —
 * through react-query (the QueryClient comes from AppBuilderProvider, as lib/passwordPolicy.ts
 * relies on). Credentials follow FETCH_CREDENTIALS; a `data:` URI is decoded inline. A raw read
 * of a file field is never the file's bytes. */
function useFileData(url: string, as: 'array' | 'text') {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['file-viewer', url, as],
    enabled: Boolean(url),
    // a file's bytes for a given url don't change — cache them so re-opening a file is instant
    staleTime: Infinity,
    // a 404/expired url should fall to the download card at once, not after a retry storm
    retry: false,
    queryFn: async (): Promise<ArrayBuffer | string> => {
      // self-contained bytes — decode without a fetch (which the connect-src CSP would block).
      if (url.startsWith('data:')) return decodeDataUrl(url, as)
      const res = await fetch(url, { credentials: FETCH_CREDENTIALS })
      if (!res.ok) throw new Error(String(res.status))
      return as === 'array' ? await res.arrayBuffer() : await res.text()
    },
  })
  return { data, loading: isLoading, error: isError }
}

function DocxView({ url, name }: { url: string; name: string }) {
  const { data, loading, error } = useFileData(url, 'array')
  const hostRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!data || !host) return
    let cancelled = false
    host.innerHTML = ''
    // docx-preview parses the OOXML and reproduces Word's layout into the host element.
    renderAsync(data as ArrayBuffer, host, undefined, {
      inWrapper: true,
      breakPages: true,
      renderChanges: true,
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [data])

  if (loading) return <Loading />
  if (error || failed)
    return <DownloadCard url={url} name={name} note="This document couldn't be previewed." />
  // docx-preview ships the document's own styles — do NOT wrap it in `prose`.
  return <div ref={hostRef} className="h-full overflow-auto bg-white p-4" />
}

function SheetView({ url, name }: { url: string; name: string }) {
  const { data, loading, error } = useFileData(url, 'array')
  const parsed = useMemo(() => {
    if (!data) return null
    try {
      const book = XLSX.read(data as ArrayBuffer, { type: 'array' })
      const sheet = book.Sheets[book.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
      return rows.slice(0, 1000)
    } catch {
      return null
    }
  }, [data])

  if (loading) return <Loading />
  if (error || !parsed || parsed.length === 0)
    return <DownloadCard url={url} name={name} note="This spreadsheet couldn't be previewed." />

  const [head, ...body] = parsed
  // widest row (so a short header row doesn't truncate wider data rows), capped like the
  // 1000-row cap so one stray far-column cell in a messy export can't explode the table
  const cols = Math.min(Math.max(...parsed.map((row) => row.length)), 200)
  return (
    <div className="h-full overflow-auto p-2">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: cols }, (_, index) => (
              <TableHead key={index}>{String(head[index] ?? '')}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {body.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: cols }, (_, colIndex) => (
                <TableCell key={colIndex}>{String(row[colIndex] ?? '')}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function PdfView({ url, name }: { url: string; name: string }) {
  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [failed, setFailed] = useState(false)
  // Same credential rule as the fetch path (FETCH_CREDENTIALS) so PDFs and other formats agree.
  // Memoised so react-pdf doesn't re-fetch every render.
  const file = useMemo(() => ({ url, withCredentials: Boolean(API_BASE) }), [url])

  if (failed) return <DownloadCard url={url} name={name} note="This PDF couldn't be previewed." />

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-center gap-3 border-b p-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-muted-foreground text-sm">
          {page} / {numPages || '…'}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= numPages}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="bg-muted flex-1 overflow-auto p-4">
        <Document
          file={file}
          loading={<Loading />}
          onLoadSuccess={(doc) => setNumPages(doc.numPages)}
          onLoadError={() => setFailed(true)}
          className="flex justify-center"
        >
          <Page pageNumber={page} renderTextLayer renderAnnotationLayer />
        </Document>
      </div>
    </div>
  )
}

function TextView({ url, name }: { url: string; name: string }) {
  const { data, loading, error } = useFileData(url, 'text')
  const text = useMemo(() => {
    const raw = (data as string) ?? ''
    if (!name.toLowerCase().endsWith('.json')) return raw
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }, [data, name])

  if (loading) return <Loading />
  if (error) return <DownloadCard url={url} name={name} note="This file couldn't be previewed." />
  return <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-4 text-sm">{text}</pre>
}

function ImageView({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <DownloadCard url={url} name={name} note="This image couldn't be previewed." />
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-4">
      <img
        src={url}
        alt={name}
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  )
}

export function FileViewer({ url, name, mimeType, className }: FileViewerProps) {
  // Nothing to fetch or render without a url — show an empty state, not an endless skeleton.
  if (!url) {
    return (
      <div className={cn('flex h-full min-h-0 w-full items-center justify-center p-6', className)}>
        <p className="text-muted-foreground text-sm">No file to preview.</p>
      </div>
    )
  }
  const kind = kindOf(name, mimeType)
  return (
    <div className={cn('h-full min-h-0 w-full', className)}>
      {/* key={url}: PdfView/DocxView hold per-file error and page state; without a remount a
          failed render or a mid-document page index leaks into the next file and strands a valid
          file on the download card. */}
      {kind === 'pdf' && <PdfView key={url} url={url} name={name} />}
      {kind === 'docx' && <DocxView key={url} url={url} name={name} />}
      {kind === 'sheet' && <SheetView url={url} name={name} />}
      {kind === 'image' && <ImageView key={url} url={url} name={name} />}
      {kind === 'text' && <TextView url={url} name={name} />}
      {(kind === 'office' || kind === 'unknown') && (
        <DownloadCard
          url={url}
          name={name}
          note={
            kind === 'office'
              ? "Preview isn't available for this Office file yet."
              : "Preview isn't available for this file type."
          }
        />
      )}
    </div>
  )
}
