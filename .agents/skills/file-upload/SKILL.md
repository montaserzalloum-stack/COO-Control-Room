---
name: file-upload
description: How the generated app uploads files — images, avatars, attachments, documents, CSVs, anything the user picks from disk, drops on a dropzone, or captures. There is exactly ONE way, `useUppy` from `@unifyapps/app-builder-sdk/hooks/upload`, and it hands back a stored URL you persist on a record in whichever of THREE shapes the object's field declares — a bare string, the platform file descriptor for a `file-uploader` field, or the plan's own attachment object. MANDATORY whenever the app has any file/image input — load it BEFORE writing an `<input type="file">`, a dropzone, an avatar picker, or an attachments field. NEVER hand-roll an upload (fetch + FormData to /api/uploads), never base64 a file into a record, never keep a `blob:` URL as if it were storage.
version: 9
---

# File upload — `useUppy`, and nothing else

Any file the user provides goes to UnifyApps storage through **`useUppy`**. It returns a
**URL**; the URL is what you store on a record. The bytes never live in your app state,
never in a record field, never in localStorage.

```ts
import { useUppy } from '@unifyapps/app-builder-sdk/hooks/upload'
```

**Already wired — nothing to mount.** `AppBuilderProvider` in `main.tsx` already provides
the uploader. Do not add a provider, do not edit `main.tsx`, do not install `uppy`.
The uploader boots lazily on the first `useUppy()` in the tree, so an app with no file
input pays nothing for it.

## The hook

```ts
const {
  files,        // UploadedFile[] — this hook's files only, in the order added
  isUploading,  // true while any of them is still going
  isReady,      // the uploader finished booting
  error,        // set only if the uploader could not start at all
  addFiles,     // (FileList | File[]) => Promise<UploadedFile[]>
  removeFile,   // (id: string) => void
  clearFiles,   // () => void
  retryFile,    // (id: string) => void
} = useUppy({
  referenceId: `product-${productId}-image`,  // optional — see "The referenceId"
  accessScope: 'PUBLIC',              // see "Who may read it" — defaults to PUBLIC
  maxFileSize: 5 * 1024 * 1024,       // optional, bytes
  maxNumberOfFiles: 5,                // optional
  allowedFileTypes: ['image/*', '.pdf'],  // optional, MIME patterns or extensions
  onUploadSuccess: (file) => {},      // optional
  onUploadError: (file) => {},        // optional
})
```

Uploads start the moment a file is added — there is no separate "start" call.

Each `useUppy()` gets its own slice of the shared uploader, so two upload surfaces on one
screen never see each other's `files`. Call it once per surface; don't lift one call up
and share its `files` across unrelated fields.

## The referenceId — what makes a surface unique

There is **one** Uppy instance for the whole app. `referenceId` is what carves it into
independent surfaces: every event is filtered by it, and it is prefixed onto the file name
before the file is added, so the same file picked in two places gets two distinct ids
instead of one upload silently overwriting the other.

**It defaults to a generated id, and for most surfaces that is correct** — a single upload
field on a page that stays mounted needs nothing from you.

**Pass your own when the surface can unmount and come back**, and derive it from *what is
being uploaded to* so it is the same string every time that surface exists:

| surface | referenceId |
| --- | --- |
| upload field inside a dialog / sheet | `` `product-${productId}-image` `` |
| one upload cell per row in a table or list | `` `attachment-${row.id}` `` |
| several distinct fields on one form | `` `${recordId}-logo` `` and `` `${recordId}-banner` `` |
| a single field on a page that never unmounts | omit it |

Why it matters: a generated id is **new on every mount**. Close a dialog mid-upload and
reopen it, and the surface no longer recognises its own in-flight files — the progress bar
comes back empty and the finished URL is lost. With a stable `referenceId` the hook
re-attaches on mount and recovers those files, including ones that completed while the
component was gone. (The local `previewUrl` does not survive a remount — it is a `blob:`
URL that is released on unmount — so render `previewUrl ?? url` and the recovered file
still shows correctly.)

**Three rules:**

1. **Unique per surface.** Two hooks sharing a `referenceId` share one file list — each
   sees the other's uploads. Never reuse one string across different fields.
2. **Stable across mounts.** `` `row-${index}` `` breaks when the list re-sorts; use the
   record's id, not its position. Never `Math.random()`, `Date.now()`, or a `useState`
   default — those are just a worse generated id.
3. **Fixed at mount.** The hook reads `referenceId` on its first render and keeps filtering
   on that value. Change it on a mounted component and the surface detaches silently — the
   file uploads, `files` stays empty, `addFiles` never resolves. Hooks may not be
   conditional, so `if (!record) return null` runs too late. Render the surface only once
   its record exists, or `key` it by the record id:

```tsx
// WRONG — mounted with `finding` null, so useUppy keeps the fallback id and never hears
// about the file picked once a finding is chosen.
<AttachEvidenceDialog finding={selectedFinding} open={open} />

function AttachEvidenceDialog({ finding }: { finding: Finding | null }) {
  const { addFiles } = useUppy({
    referenceId: finding ? `evidence-${finding.id}` : 'evidence',
  })
  if (!finding) return null   // too late — the hook above already ran

// RIGHT
{selectedFinding ? <AttachEvidenceDialog finding={selectedFinding} open={open} /> : null}
```

## Which cloud storage does it upload to?

**Not your decision, and there is nothing to configure.** The uploader asks the platform
which storage the tenant runs on (`/api/file/cloud-storage-provider`) while it boots, and
picks the right path itself:

| tenant provider | how the file goes up |
| --- | --- |
| `s3` | S3 multipart, direct to the bucket, negotiated through the platform |
| `nfs` / `unifyapps` (Azure) | chunked through the platform's own upload API |

Same `useUppy` call, same `UploadedFile` back, either way. Never branch on the provider,
never ask the user which storage to use, and never put a bucket name, region, endpoint or
key in the app — the app never sees any of them.

The one place it shows through is `accessScope: 'PUBLIC'`: on a bucket that accepts public
objects you get a plain `https://…` URL, and on one that doesn't the platform serves the
file through an authenticated path instead. Both come back in `url` and both render — you
do not handle the two cases differently.

## The output structure

`addFiles` resolves to — and `files` contains — this shape:

```ts
interface UploadedFile {
  id: string        // stable; use it as the React key and for removeFile/retryFile
  name: string      // sanitized file name as stored
  size: number      // bytes
  type: string      // MIME, e.g. 'image/png'
  status: 'uploading' | 'success' | 'error'
  progress: number  // 0-100
  url?: string      // ← THE VALUE YOU PERSIST. Present only when status === 'success'
  previewUrl?: string  // local blob: URL, available immediately. Preview ONLY — never persist
  error?: string    // human-readable reason, when status === 'error'
  key?: string      // object-storage coordinates, when the provider returned them
  bucket?: string
}
```

Three things follow from that shape, and getting any of them wrong ships a broken app:

1. **`url` is the only thing worth saving.** Not `previewUrl` (a `blob:` URL that dies with
   the tab), not `id` (uppy's, not the backend's), not the `File` object.
2. **`url` is absent until `status === 'success'`.** Never write a record with
   `url: undefined` and "fix it later" — `await addFiles(...)` first, then save.
3. **Render `previewUrl ?? url`.** The preview exists instantly; the stored URL arrives at
   the end. That one expression gives an image thumbnail with zero perceived latency.

## `addFiles` — what it resolves to

`await addFiles(fileList)` resolves **after every file in the batch has settled**, to one
`UploadedFile` per input file. It does **not** reject when a single file fails: that file
comes back with `status: 'error'` and a message in `error`. Check the status.

```ts
const results = await addFiles(event.target.files ?? [])
const uploaded = results.filter((file) => file.status === 'success')
const failed = results.filter((file) => file.status === 'error')
```

It rejects only if the uploader itself never started (no network, misconfigured tenant) —
the same condition the hook's `error` field reports.

Files rejected by `maxFileSize` / `maxNumberOfFiles` / `allowedFileTypes` are checked
**before** the upload starts: they come back in the resolved array with `status: 'error'`
and are **not** added to `files`. Surface `error` on those to the user (a toast is fine);
they are user mistakes, not failures.

## Who may read it — `accessScope`

| scope | who can read the file | use it for |
| --- | --- | --- |
| `'PUBLIC'` *(default)* | anyone with the link, no sign-in | anything the app **displays**: avatars, product images, logos, gallery photos, public attachments |
| `'APPLICATION'` | users of this app | files that should not leak outside the app |
| `'USER'` | only the uploader | private documents, personal ID uploads |
| `'ALL_USERS'` | any signed-in user of the tenant | shared internal documents |

**Default to `'PUBLIC'` for anything rendered in an `<img>`, `<video>`, or a download
link.** A non-public URL is authenticated: it resolves in the deployed app (same origin,
real session) but a plain `<img src>` from the dev server or the engine preview is
cross-origin and will 401 — so a restricted image looks "broken" in preview even though
the upload succeeded. Only pick a narrower scope when the plan actually calls for
restricted files, and say so in your summary if previews will look empty because of it.

## Persisting the upload — THREE field shapes, and writing the wrong one loses the file

The upload is only half the job. What you write onto the record is whatever the object's
field was declared to hold, and **there are three shapes**. Getting this wrong does not
error: the record saves, the app says "saved", and the file is simply gone.

**Read the field's schema and match it. That is the whole rule** — on an object you did
not create, `read_object` gives you that schema; who created the field only matters
when no tool has told you.

| The object's field | What you persist |
| --- | --- |
| `{ "type": "string" }` | `uploaded.url` — the bare URL string |
| `{ "type": "object", "format": "file-uploader" }` | the platform **file descriptor** (below) |
| `{ "type": "object" }` with its own `properties`, no `file-uploader` format | an object with **exactly those keys** |

An array field — `{ "type": "array" }` — is the same three choices one level down: a list
of URLs, of descriptors, or of the schema's own objects.

**On an object you did not create, `read_object(entity_type=…)` tells you which row
you are in — call it and read the answer, do not infer one.** It decodes the stored schema
the way the platform's own object editor does, reports a `file-uploader` field as
`file-upload`, and says outright that the field takes *a file REFERENCE object from a real
upload, not a path or a filename you compose*. That is row two. A file field it reports as
plain `text` is row one.

Only when you have not read the schema — an object you just created yourself, or a field
the plan describes and no tool has confirmed — fall back on who made it:

- **Your PLAN declared the shape.** Follow the plan, key for key. Plans routinely specify
  their own attachment object — `{ url, fileName, mimeType, sizeBytes }` is a common one —
  and that is the third row, not the second. Do NOT substitute the platform descriptor's
  names (`name`, `size`) for the plan's (`fileName`, `sizeBytes`).
- **You created the object with `create_object`.** Then the field is whatever schema you
  sent. Its `fields` list only accepts `string`/`number`/`integer`/`boolean`, so a field
  built that way is a plain URL string — but the `json_schema` argument is passed through
  verbatim, so a schema you wrote with an object or array field creates exactly that.
- **The object already existed and you could not read it.** Objects minted ahead of the
  app — the Solution Builder path, where the planner's `objectSpecs` are created by
  `Create Or Update Object` before Generate App is dispatched — map "file" and
  "attachment" to `{ "type": "object", "format": "file-uploader" }`. Assume the
  descriptor, and say in your summary that you assumed it.

In every case the field is added with `create_object` / `update_object` and written through
the normal `CREATE` / `UPDATE` binding (see the `object-data` skill) — only the VALUE
differs.

### The string field

```ts
const [uploaded] = await addFiles(event.target.files ?? [])
if (uploaded?.status !== 'success') return toast.error(uploaded?.error ?? 'Upload failed')
await createProduct({ name, imageUrl: uploaded.url })
```

Read it back as-is: `<img src={product.imageUrl} />`, `<a href={product.imageUrl}>`.

### The `file-uploader` field

This is the platform's native file type — it renders the file as a chip with a download
button in the backend record grid, and no-code Form blocks bind to it. It holds an
**object**, never a URL.

The platform mints the field with these declared properties — `fileType`, `id`,
`isUploaded`, `key`, `name`, `progress`, `size`, `temporaryUrl`, `url`, `mimeType` —
`additionalProperties: true`, and **`required: ["url"]`**. So `url` is the one key that
must be there; the rest are how the file renders, and extras ride along untouched.

Two of them are load-bearing even though the schema calls them optional:

- **`isUploaded`** gates readers. The PDFViewer block resolves
  `fileUrl && isUploaded ? adapt(fileUrl) : undefined` — a record without a truthy
  `isUploaded` yields no document at all, silently.
- **`id`** is part of the standard record everywhere it is written. Use `file.id` from the
  hook; the platform's own stored ids are these uppy ids.

```json
{
  "id": "uppy-policy/pdf-1e-application/pdf-90210-1755000000000",
  "name": "policy.pdf",
  "url": "https://…/policy.pdf",
  "source": "https://…/policy.pdf",
  "sourceType": "URL",
  "fileType": "pdf",
  "mimeType": "application/pdf",
  "size": 90210,
  "progress": 100,
  "isUploaded": true,
  "type": "FILE"
}
```

Map the `UploadedFile` onto it once, in `app/src/data/`, and use that helper everywhere:

```ts
// app/src/data/files.ts
import type { UploadedFile } from '@unifyapps/app-builder-sdk/hooks/upload'

export type FileUploaderValue = {
  id: string; name: string; url: string; size: number; mimeType: string; fileType: string
  source: string; sourceType: 'URL' | 'CLOUD_STORAGE'
  isUploaded: true; progress: 100; type: 'FILE'
}

/** A successfully uploaded file, in the shape a `format: "file-uploader"` field stores.
 *  `accessScope` is the one this file's `useUppy` was called with. */
export function toFileUploaderValue(
  file: UploadedFile,
  accessScope: 'PUBLIC' | 'APPLICATION' | 'USER' | 'ALL_USERS' = 'PUBLIC',
): FileUploaderValue {
  if (file.status !== 'success' || !file.url) {
    throw new Error(file.error ?? 'Upload did not finish')
  }
  // `key` comes back only from S3 multipart. On an Azure/nfs/xhr tenant there is none,
  // and CLOUD_STORAGE would name a source that does not exist — so fall back to the URL.
  // A PUBLIC file's key is in the public bucket; CLOUD_STORAGE reads the private one.
  const byUrl = !file.key || accessScope === 'PUBLIC'
  return {
    id: file.id,
    name: file.name,
    url: file.url,
    source: byUrl ? file.url : file.key!,
    sourceType: byUrl ? 'URL' : 'CLOUD_STORAGE',
    fileType: file.name.split('.').pop()?.toLowerCase() ?? '',
    mimeType: file.type,
    size: file.size,
    progress: 100,
    isUploaded: true,
    type: 'FILE',
  }
}
```

Pass the `accessScope` you gave `useUppy` when it is not `'PUBLIC'`.

**Never hardcode `sourceType`.** It is derived, and the two values are not
interchangeable: `URL` means `source` holds the address, `CLOUD_STORAGE` means it holds
the bucket key. Picking the wrong one leaves a record that looks complete and resolves to
nothing.

```ts
const [uploaded] = await addFiles(event.target.files ?? [])
if (uploaded?.status !== 'success') return toast.error(uploaded?.error ?? 'Upload failed')
await createSubmission({ title, pdfFile: toFileUploaderValue(uploaded) })
```

**Reading it back, the field is not a URL** — `href={record.pdfFile}` renders the literal
string `[object Object]` and the link 404s. Always go through `.url`, and always guard,
because a record written before the field was populated holds `{}`:

```tsx
const href = record.pdfFile?.url
{href
  ? <a href={href} target="_blank" rel="noreferrer">Open PDF</a>
  : <p className="text-muted-foreground text-sm">No file stored for this record.</p>}
```

**A bare string written into a `file-uploader` field is dropped.** The create succeeds, the
stored value is `{}`, and the bytes are orphaned in storage with nothing pointing at them.
Nothing in the response says so — the only way to catch it is to get the shape right
up front, or to read one record back after the first write and confirm `url` is there.

### The plan's own attachment object

When the plan — or a schema you wrote yourself — declares an object field with its own
properties and no `file-uploader` format, that schema is the contract. Build the value
from the `UploadedFile` to match **its** keys, not the platform descriptor's:

```ts
// plan says: signedContract — attachment object with url, fileName, mimeType, sizeBytes
const [uploaded] = await addFiles(event.target.files ?? [])
if (uploaded?.status !== 'success') return toast.error(uploaded?.error ?? 'Upload failed')
await createSubmission({
  vendorName,
  signedContract: {
    url: uploaded.url,
    fileName: uploaded.name,
    mimeType: uploaded.type,
    sizeBytes: uploaded.size,
  },
})
```

The `UploadedFile` names and the plan's names rarely line up — `name` vs `fileName`,
`size` vs `sizeBytes` — so map them explicitly rather than spreading `...uploaded` in and
hoping. Spreading also drags `previewUrl`, `progress` and `status` into the record, none
of which belong there.

Read it back through whichever key the plan named: `record.signedContract?.url`. Same
guard as any object field — a record saved before the upload landed has no `url`.

### Several files on one field

The shape repeats one level down: an array field holds a list of URLs, a list of
descriptors, or a list of the schema's own objects — whichever single-file shape the field
declares. Map the whole batch and keep only what succeeded — `addFiles` resolves one result per input file and does
not reject when one of them fails.

```ts
const results = await addFiles(event.target.files ?? [])
const uploaded = results.filter((file) => file.status === 'success')
results.filter((file) => file.status === 'error').forEach((file) => toast.error(file.error))
await createSubmission({ title, attachments: uploaded.map((file) => toFileUploaderValue(file)) })
```

Reading a multi-file field means `[0]` or a `.map()` in the middle — `record.attachments`
is a list, so `record.attachments?.url` is always `undefined`. Decide single-vs-multiple
before anything binds to the field.

### Whichever shape

Never store the file itself: no base64 data URLs in a record, no `File` in zustand, no
`blob:` URL anywhere durable. And never write the record before the upload settles —
`await addFiles(...)`, check `status`, then save.

## Rendering it back — `?preview=true`, or the browser downloads it

The stored `url` is a **download** URL. `/api/file/asset/download/<assetId>` answers with
`Content-Disposition: attachment`, so any element that would otherwise render the bytes
inline saves them to disk instead:

| element | on the bare `url` |
|---|---|
| `<a href={url} download>` | ✅ downloads — what the header is for |
| `<iframe src={url}>` / `<embed>` / `<object>` | ❌ **downloads** — the frame stays empty |
| `<img src={url}>` | ✅ renders — browsers ignore the disposition for images |

That asymmetry is why this hides: an app full of working thumbnails can have a PDF viewer
that silently downloads on open, and the code looks right either way.

The same endpoint serves the bytes inline when asked. `AuthFileRestAPI.downloadAsset` takes
a `preview` query param and, when it is set, returns the file with its real MIME type and
**no `Content-Disposition`**. So:

```ts
/** The same asset, served inline — for <iframe>, <embed>, <object>, a PDF viewer. */
export function inlineUrl(file: { url: string }): string {
  return `${file.url}${file.url.includes('?') ? '&' : '?'}preview=true`
}
```

```tsx
// render inline…
<iframe title={`Preview: ${pdf.name}`} src={inlineUrl(pdf)} className="h-[68vh] w-full" />

// …but link to download with the bare url
<a href={pdf.url} target="_blank" rel="noreferrer">Open {pdf.name}</a>
```

**Use `preview=true` only for rendering.** A download control wants the plain `url` — adding
the param there strips the filename the `Content-Disposition` carries, so the browser saves
it under the asset id instead of `policy.pdf`.

Images need nothing: `<img src={file.url}>` is correct as-is — **so long as the record
carries a `url`**, which is only true of files this app uploaded. See the next section.

## A file this app did not upload — a storage path is not a URL

Everything above assumes THIS app performed the upload, so the record carries a `url`. A file
stored by anything else — a workflow or automation upload, a seeded row, a mobile capture — is a
**private storage path**, and the record holds no `url` at all:

```
file_source:      workflow_uploads/147/visit-8812/shelf-3.jpg
file_source_type: CLOUD_STORAGE
```

Nothing renders that directly. `<img src={record.file_source}>` resolves it against the app's own
origin and 404s — no error thrown, no fallback, a blank element on a clean 200.

**Nor can you assemble the URL.** A real build, given exactly this, wrote:

```ts
// WRONG — `file_source` is a bucket key; that endpoint takes an asset ID
return `/api/file/asset/download/${encodeURIComponent(photo.file_source)}?preview=true`
```

It had read the section above, kept `?preview=true` correctly, and put a storage path where an
asset id belongs. It reviews as correct and resolves to nothing.

**The only thing that converts a path into an address** is the action
`utility_by_unifyapps_generate_public_url` on the `utility_by_unifyapps` connector. Its `file`
input takes a platform file descriptor — `{ name, source, sourceType, fileType, mimeType, size }`.

**Those are the DESCRIPTOR's key names, not your object's, and you have to map them.** The row
above carries the same two facts under `file_source` and `file_source_type`; another object will
spell them differently again, so `read_object` is what tells you. `source` takes the path and
`sourceType` the storage kind, and you fill the rest from whatever the row actually holds — a row
like the one above has no name, size or MIME type to give. The input is declared as a bare object,
so a descriptor of `undefined`s is accepted and resolves nothing: no validation error, same blank
element as before.

`preview` **defaults to `false`**, which serves the file as a download — pass **`true`** for
anything rendered inline. That is the node's own input, decided before the URL exists, and it is
not the `?preview=true` query param above.

**The URL it returns is final. Do not append to it and do not run it through `inlineUrl()`.** It
is presigned; the signature covers the query string, so one extra parameter turns every image
into a 403. `inlineUrl()` is for a url a record already carries.

`expiryTime` is in hours and **defaults to 1**, but it is not a guarantee: the platform's own note
on this action says the URL stays valid as long as the S3 signing token has not expired,
*regardless of the expiry time provided*. So treat every resolved URL as short-lived whatever you
passed — resolve on open and never store the result on a record or in long-lived state.

Reach it as you would any automation: connect an existing one per `automation-integration`, or
author one per `workflow-authoring`, and resolve a screen's files in ONE call rather than one per
thumbnail.

## A complete surface

```tsx
type Props = { productId: string; value?: string; onChange: (url?: string) => void }

function ProductImageField({ productId, value, onChange }: Props) {
  const { files, isUploading, addFiles, removeFile } = useUppy({
    // stable, because this field lives in a dialog that unmounts when closed
    referenceId: `product-${productId}-image`,
    accessScope: 'PUBLIC',
    maxNumberOfFiles: 1,
    maxFileSize: 5 * 1024 * 1024,
    allowedFileTypes: ['image/*'],
  })
  const file = files[0]

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const [uploaded] = await addFiles(event.target.files ?? [])
    if (uploaded?.status === 'success') onChange(uploaded.url)
    else if (uploaded?.error) toast.error(uploaded.error)
  }

  const preview = file?.previewUrl ?? value

  return (
    <div className="space-y-2">
      {preview ? <img src={preview} alt="" className="size-24 rounded-md object-cover" /> : null}
      {isUploading ? <Progress value={file?.progress ?? 0} /> : null}
      <Input type="file" accept="image/*" onChange={handleChange} disabled={isUploading} />
      {file ? (
        <Button variant="ghost" size="sm" onClick={() => { removeFile(file.id); onChange(undefined) }}>
          Remove
        </Button>
      ) : null}
    </div>
  )
}
```

Drag-and-drop is the same call — take `event.dataTransfer.files` and pass it to `addFiles`.

## Never

- `fetch('/api/uploads', { body: formData })`, or any hand-rolled upload request. The real
  flow negotiates the tenant's storage provider, chunks large files, and resolves a
  readable URL afterwards. A hand-rolled POST skips all of it and 403s or orphans the file.
- Writing a file's `url`/`source` yourself — from its name, a storage host
  (`storage.unifyapps.com` does not exist) or a path template — and saving it with
  `isUploaded: true`. Nothing was uploaded; the record points at nothing.
- Showing a stored file as a label or badge that opens nothing. Link it: `href={record.file?.url}`.
- Installing `uppy`, `react-dropzone`'s uploader, `filepond`, or any other upload library.
- `FileReader` → base64 → store in a record. It bloats the record, breaks on anything
  over a megabyte, and there is no URL to render later.
- Keeping `previewUrl` after the upload finishes, or persisting it anywhere.
- Reading `file.url` before `status === 'success'`.
- Writing a bare URL string into a `format: "file-uploader"` field. It does not error —
  the record stores `{}` and the file is lost. That field takes the descriptor object.
- Using an object field as if it were a URL: `src={record.photo}`, `href={record.doc}`,
  `{record.file}` in JSX. It is an object; read `.url` off it.
- Pointing `<img>`, an `<iframe>` or a viewer at a storage PATH — `src={record.file_source}` —
  or at a descriptor carrying no `url`. A path is not an address: it 404s against the app's own
  origin, rendering nothing and throwing nothing.
- Assembling an asset URL around a storage path —
  `/api/file/asset/download/${record.file_source}?preview=true`. That endpoint takes an asset ID,
  not a bucket key.
- Appending anything to a url `generate_public_url` returned — `?preview=true`, a cache-buster,
  `inlineUrl(resolved)`. It is presigned and the signature covers the query string, so the extra
  parameter 403s every request. Ask the node for `preview: true` instead.
- Answering a plan's own attachment schema with the platform descriptor's key names, or
  the reverse. `name`/`size` and `fileName`/`sizeBytes` are different contracts — write
  the keys the field actually declares.
- Spreading `...uploaded` into a record. It carries `previewUrl`, `status` and `error`,
  none of which belong in storage, and it omits `sourceType`/`type`. Map keys explicitly.
- Hardcoding `sourceType: 'CLOUD_STORAGE'`. It is derived from whether the upload
  returned a `key`, which only S3 multipart tenants do — hardcode it on an Azure/nfs
  tenant and `source` names a bucket key that was never created.
- Omitting `isUploaded`. Readers gate on it; the PDFViewer block renders nothing at all
  for a record whose `isUploaded` is not truthy, and says nothing about why.
- Pointing an `<iframe>`, `<embed>` or `<object>` at the bare `url`. That URL carries
  `Content-Disposition: attachment`, so the viewer downloads the file instead of showing
  it — add `?preview=true` (see above). `<img>` is unaffected, which is what makes the
  bug look like "PDFs are broken" rather than "the URL is wrong".
- Adding a second `AppBuilderProvider`, an `UppyProvider`, or editing `main.tsx`.
