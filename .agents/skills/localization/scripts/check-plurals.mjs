#!/usr/bin/env node
/**
 * Plural-completeness check — the backstop for keys extraction cannot see.
 *
 * MOST of this problem is handled by `allPluralForms: true` in i18next.config.mjs: it
 * scaffolds every form any configured locale needs, and `status` then counts each locale
 * against the forms THAT locale actually uses, so a missing Polish `_few` shows up as an
 * ordinary untranslated key. Reach for that first; it needs no agent knowledge at all.
 *
 * What it cannot reach is a plural key that never appears as a literal — one named only
 * indirectly, like `t(rule.labelKey)` with the key coming from a helper and kept alive by
 * `preservePatterns`. Extraction never regenerates those, so there is nothing for
 * `allPluralForms` to expand, and they stay at whatever forms the default language happened
 * to have. Measured on a real three-locale build: of eleven counted strings missing a
 * required form, six came from ordinary call sites (now covered by the flag) and five were
 * dynamic keys, which only this can catch.
 *
 * So it asks each language on its own terms: for every counted string, does this language
 * have every plural form THE LANGUAGE requires? The required set comes from
 * `Intl.PluralRules` — the same CLDR data i18next uses to pick a form at runtime — so it is
 * never a hand-maintained table that can drift.
 *
 * It also carries FURTHER catalogue checks (untranslated values, interpolation parity, and a
 * source pass for unresolvable template-literal keys) that are not about plurals and are here
 * because this is the
 * only script that already walks every catalogue in every language: ENGLISH SITTING IN A
 * NON-ENGLISH FILE. An empty value is honest — it falls back to the default language and
 * `status` counts it as missing — but a value COPIED from English marks the string done,
 * `status` reads 100%, and nobody revisits it. Measured on a real build: `status` reported
 * ar 100% (383/383) with 46 English values in the Arabic catalogues, a whole auth flow among
 * them. No type can catch that and no extraction sees it; comparing the two files does.
 *
 * Its one known false positive is a value that genuinely does not change — a brand name.
 * The fix there is the same as the fix for a missing one: set it to "", which falls back to
 * the default language and renders identically, while saying so honestly on disk.
 *
 * Usage — run it from INSIDE the app (the directory holding src/i18n), which is how it finds
 * the catalogues. It ships with the `localization` skill, so in a generated app that is:
 *   cd app && node ../.agents/skills/localization/scripts/check-plurals.mjs
 *   cd app && node ../.agents/skills/localization/scripts/check-plurals.mjs --strict
 * (`--strict`: empty forms fail too, not just missing ones.) The engine's build gate runs its
 * OWN copy of this file the same way, so an edited copy in the app changes nothing it checks.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Whichever app you are STANDING IN — the catalogues are found from the working directory, never
// from this file's location, because the file no longer lives inside an app: it ships with the
// skill and is run from wherever the app is. The anchored fallback only serves a copy that
// still sits in an older app's own `scripts/`, where `..` is that app.
const ANCHORED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = existsSync(path.join(process.cwd(), 'src', 'i18n')) ? process.cwd() : ANCHORED
const I18N = path.join(ROOT, 'src', 'i18n')
const STRICT = process.argv.includes('--strict')

const SUFFIX = /^(.*)_(zero|one|two|few|many|other)$/
// A key can END in `_other` without being a plural — `select_other`, `status_other`. The
// tell is `_one`: i18next only ever writes a `_one` alongside `_other` when it pluralised
// the key, and a hand-written pair of unrelated keys sharing a base is not a real case worth
// mis-reporting for. So a base counts as plural only when the DEFAULT language gave it more
// than one form; a lone `_other` is left alone.
const isRealPlural = (forms) => forms.size > 1
// i18next spells ordinals `key_ordinal_one`. They have their own CLDR rule set; this check
// covers cardinals, and skipping them is better than judging them by the wrong table.
const ORDINAL = /_ordinal_(zero|one|two|few|many|other)$/

const problems = []
const report = (level, rule, file, message) =>
  problems.push({ level, rule, file: path.relative(ROOT, file), message })

function categoriesFor(locale) {
  try {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  } catch {
    return null
  }
}

function readCatalog(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    report('error', 'invalid-json', file, error.message)
    return {}
  }
}

/** base key -> the set of plural forms present for it, ignoring ordinals. */
function pluralBases(catalog) {
  const bases = new Map()
  for (const key of Object.keys(catalog)) {
    if (ORDINAL.test(key)) continue
    const match = SUFFIX.exec(key)
    if (!match) continue
    const [, base, form] = match
    if (!bases.has(base)) bases.set(base, new Set())
    bases.get(base).add(form)
  }
  return bases
}

// -------------------------------------------------------------------------------------
// Encoding artifacts. A catalogue value is plain UTF-8 text rendered verbatim as a DOM text
// node, so there is NO valid reason for any of these to appear in one:
//   mojibake            UTF-8 bytes decoded as Latin-1 ("Ã©" for "é",
//                       "Ø§" where Arabic belongs) — the value was re-encoded
//                       through the wrong charset somewhere.
//   literal \uXXXX      a backslash-u sequence surviving INTO the parsed value means it was
//                       double-escaped in the file; the user sees "ह..." as text.
//   HTML entities       React does not decode "&amp;"/"&#x627;" in text — they render
//                       literally. JSON is UTF-8; write the character itself.
//   U+FFFD              the replacement character is a decode failure made visible.
// Checked for EVERY language, the default included — encoding damage is charset trouble,
// not translation trouble.
// -------------------------------------------------------------------------------------
const cc = String.fromCharCode
const CONT = '[' + cc(0x80) + '-' + cc(0xbf) + ']'
const ENCODING_ARTIFACTS = [
  ['mojibake', new RegExp('(?:' + [
    cc(0xc3) + CONT, cc(0xd8) + CONT, cc(0xd9) + CONT,
    cc(0xe0) + cc(0xa4), cc(0xe0) + cc(0xa5), cc(0xe0) + cc(0xb0), cc(0xe0) + cc(0xb1),
    cc(0xe2) + cc(0x80), cc(0xc2) + CONT].join('|') + ')')],
  ['literal unicode escape', /\\u[0-9a-fA-F]{4}/],
  ['HTML entity', /&(?:amp|quot|apos|nbsp|lt|gt|rsquo|lsquo|rdquo|ldquo|hellip|mdash|ndash|#\d{2,6}|#x[0-9a-fA-F]{2,6});/],
  ['replacement character U+FFFD', new RegExp(cc(0xfffd))],
]

const manifestPath = path.join(I18N, 'languages.json')
if (!existsSync(manifestPath)) {
  console.error(`plurals: missing ${path.relative(ROOT, manifestPath)} — see src/lib/i18n`)
  process.exit(1)
}
/** The script a language is WRITTEN IN, from CLDR — `ar` -> `Arab`, `ru` -> `Cyrl`, `es` ->
 *  `Latn`. Same principle as the plural categories above: asked of `Intl`, never a table
 *  here that can drift. `maximize()` is what fills in the script a bare tag omits.
 *
 *  A `Latn` language is SKIPPED by the caller, and that limit is the honest one: Spanish
 *  "Total" really is "Total", so an identical value there is ordinary rather than evidence
 *  of anything. Where the scripts differ, English in the file is unambiguous. */
const scriptFor = (lang) => {
  try {
    return new Intl.Locale(lang).maximize().script ?? null
  } catch {
    return null
  }
}

/** Ranges wide enough to answer "is there any text in this script here". Not a full
 *  Unicode property test — `\p{Script=…}` would be exact, but it needs the script NAME to
 *  match a property value, and CLDR's four-letter codes do not. These cover the scripts a
 *  generated app has actually shipped in. */
const SCRIPT_RANGES = {
  Arab: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
  Hebr: /[֐-׿יִ-ﭏ]/,
  Cyrl: /[Ѐ-ӿԀ-ԯ]/,
  Grek: /[Ͱ-Ͽἀ-῿]/,
  Hans: /[一-鿿㐀-䶿]/,
  Hant: /[一-鿿㐀-䶿]/,
  Jpan: /[぀-ヿ一-鿿]/,
  Kore: /[가-힯ᄀ-ᇿ]/,
  Thai: /[฀-๿]/,
  Deva: /[ऀ-ॿ]/,
  Telu: /[ఀ-౿]/,
  Knda: /[ಀ-೿]/,
  Taml: /[஀-௿]/,
  Beng: /[ঀ-৿]/,
  Gujr: /[઀-૿]/,
  Guru: /[਀-੿]/,
  Mlym: /[ഀ-ൿ]/,
}

/** A value that is still English: it has a RUN of Latin letters and nothing in the target
 *  script. The run matters — `{{count}}`, `MORROW15` and `9.8` are not prose, and a value
 *  that is only an interpolation or a number is the same in every language. */
const looksUntranslated = (value, script) => {
  const range = SCRIPT_RANGES[script]
  if (!range) return false // a script this cannot test is not one it may accuse
  if (range.test(value)) return false
  const withoutPlaceholders = value.replace(/\{\{[^}]*\}\}/g, ' ').replace(/<\/?[^>]*>/g, ' ')
  return /[A-Za-z]{3,}/.test(withoutPlaceholders)
}

/** Latin PROSE words in a value: runs of letters carrying lowercase and no digits, with
 *  placeholders and tags stripped. Brands ("Casa Alfama"), acronyms (CSV, PDF), codes
 *  (LHR, MORROW15) and identifiers survive translation legitimately — but they arrive as
 *  one or two tokens. Four or more prose words alongside target-script text is a sentence
 *  that was never translated, with a word or two swapped to look done. */
const latinProseWords = (value) => {
  const body = value.replace(/\{\{[^}]*\}\}/g, ' ').replace(/<\/?[^>]*>/g, ' ')
  return (body.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => /[a-z]/.test(w) && !/\d/.test(w)).length
}

/** Source files, for the dynamic-key pass below. The catalogue passes do not need these. */
const sourceFiles = (dir, out = []) => {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'i18n') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** `const { t: common } = useTranslation('common')` — the translator is not always called
 *  `t`, and a renamed one builds keys just as dynamically. i18next.config.mjs follows the
 *  rename for extraction; this follows it for the same reason. */
const TRANSLATOR_ALIAS = /\bt\s*:\s*([A-Za-z_$][\w$]*)/g

/** A key built from a template literal: `` t(`status.${x}`) ``. Captures the STATIC head —
 *  `status.` — which is the only part that can be checked against the catalogue. */
const templateKeyCall = (names) =>
  new RegExp(String.raw`\b(?:${names.join('|')})\(\s*\`([^\`$]*)\$\{`, 'g')

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const DEFAULT_LANG = manifest.default
const LANGS = Object.keys(manifest.languages ?? {})

for (const lang of [DEFAULT_LANG, ...LANGS.filter((l) => l !== DEFAULT_LANG)]) {
  const dir = path.join(I18N, lang)
  if (!existsSync(dir)) continue // missing-language reports that
  for (const entry of readdirSync(dir).filter((e) => e.endsWith('.json'))) {
    const file = path.join(dir, entry)
    const catalog = readCatalog(file)
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== 'string') continue
      for (const [what, rx] of ENCODING_ARTIFACTS) {
        const m = rx.exec(value)
        if (!m) continue
        report('error', 'encoding-artifact', file,
          `${key} — ${what} in the value (${JSON.stringify(value.slice(Math.max(0, m.index - 12), m.index + 16))}…).` +
          ` Catalogue values are plain UTF-8 text rendered verbatim; rewrite the value with the` +
          ` real characters.`)
        break
      }
    }
  }
}

// Which keys are counted at all is a fact about the CODE, and the default language is the
// closest thing to it on disk — extraction writes it from the call sites. A language that
// simply omits a whole counted key is `status`'s business, not this check's.
const defaultDir = path.join(I18N, DEFAULT_LANG)
if (!existsSync(defaultDir)) {
  console.error(`plurals: no catalogues for the default language (${DEFAULT_LANG})`)
  process.exit(1)
}

const countedKeys = new Map() // catalogue name -> Set(base key)
for (const entry of readdirSync(defaultDir)) {
  if (!entry.endsWith('.json')) continue
  const bases = pluralBases(readCatalog(path.join(defaultDir, entry)))
  const real = [...bases].filter(([, forms]) => isRealPlural(forms)).map(([base]) => base)
  if (real.length) countedKeys.set(entry, new Set(real))
}

for (const lang of LANGS) {
  if (lang === DEFAULT_LANG) continue // checked on its own terms below, once
  const required = categoriesFor(lang)
  if (!required) {
    report('error', 'unknown-language', manifestPath, `Intl has no plural rules for "${lang}" — check the tag in languages.json`)
    continue
  }

  for (const [entry, bases] of countedKeys) {
    const file = path.join(I18N, lang, entry)
    if (!existsSync(file)) continue // `status` already reports a whole missing catalogue
    const catalog = readCatalog(file)
    const present = pluralBases(catalog)

    for (const base of bases) {
      const have = present.get(base)
      if (!have) continue // the key is absent entirely — `status` reports that

      const missing = required.filter((form) => !have.has(`${form}`))
      if (missing.length) {
        report('error', 'missing-plural-form', file,
          `${base} — ${lang} needs ${required.join('/')}, missing ${missing.join(', ')}`)
      }

      const blank = required.filter((form) => have.has(form) && catalog[`${base}_${form}`] === '')
      if (blank.length) {
        report(STRICT ? 'error' : 'warn', 'untranslated-plural-form', file,
          `${base} — ${blank.length} form(s) present but empty: ${blank.join(', ')}`)
      }
    }
  }

  // ---------------------------------------------------------------------------------
  // Interpolation parity. Runs for EVERY language, Latin-script ones included: a Spanish
  // value with a typo'd variable is exactly as broken as an Arabic one. Two directions,
  // treated differently on purpose:
  //
  //   INVENTED — the translation uses a variable the default language never does
  //   (`{{amout}}` for `{{amount}}`). Renders the literal braces at the user. Always an
  //   error, and for a plural form the comparison is against the whole FAMILY's variables,
  //   because a form is free to use any variable its siblings do.
  //
  //   DROPPED — the translation lacks a variable the default value has. For a NON-plural
  //   key that loses information (`shippingAway` without `{{amount}}` names no amount).
  //   For a PLURAL FORM it is legitimate and common — "كل يوم" for `_one` needs no
  //   `{{count}}`, exactly as English "1 item" would not — so plural forms are exempt.
  // ---------------------------------------------------------------------------------
  const varsOf = (value) => {
    const names = new Set()
    for (const [, name] of value.matchAll(/\{\{\s*([^,}\s]+)/g)) names.add(name)
    return names
  }
  if (!existsSync(path.join(I18N, lang))) {
    report('error', 'missing-language', manifestPath,
      `"${lang}" is declared in languages.json but src/i18n/${lang}/ does not exist — the` +
      ` switcher offers it and every screen falls back to ${DEFAULT_LANG}. Run i18n:sync,` +
      ` then translate, or remove the declaration.`)
    continue
  }

  for (const entry of readdirSync(defaultDir).filter((e) => e.endsWith('.json'))) {
    const primary = readCatalog(path.join(defaultDir, entry))
    const perBase = new Map() // base key -> Set of variables across the default family
    for (const [key, value] of Object.entries(primary)) {
      if (typeof value !== 'string') continue
      const base = SUFFIX.exec(key)?.[1] ?? key
      const set = perBase.get(base) ?? new Set()
      for (const v of varsOf(value)) set.add(v)
      perBase.set(base, set)
    }

    const file = path.join(I18N, lang, entry)
    if (!existsSync(file)) continue
    const catalog = readCatalog(file)
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== 'string' || !value.trim()) continue // empty is honest
      const suffix = SUFFIX.exec(key)
      const base = suffix?.[1] ?? key
      const target = varsOf(value)
      const allowed = perBase.get(base)
      if (!allowed) continue // key absent from the default language — status's business
      const invented = [...target].filter((v) => !allowed.has(v))
      if (invented.length) {
        report('error', 'interpolation-mismatch', file,
          `${key} — uses {{${invented.join('}}, {{')}}} which no ${DEFAULT_LANG} value of this key has;` +
          ` it will render as literal braces. Match the ${DEFAULT_LANG} variable names exactly.`)
      }
      // A STUB: the whole default-language value embedded inside the "translation" —
      // "हिंदी अनुवाद: Section comparison". Contains the target script, so the
      // untranslated-value pass cannot see it; `status` counts it done. One real build
      // shipped 428 of these across three languages. Only checked for defaults long
      // enough that containment cannot be a coincidence.
      const primaryValue = typeof primary[key] === 'string' ? primary[key].trim() : ''
      if (primaryValue.length >= 8 && value.length > primaryValue.length && value.includes(primaryValue)) {
        report('error', 'stub-translation', file,
          `${key} — the whole ${DEFAULT_LANG} text sits inside the value (${JSON.stringify(value.slice(0, 48))}…):` +
          ` a "translation of:" stub, not a translation. Translate it, or set "" to fall back honestly.`)
      }
      if (!suffix && typeof primary[key] === 'string' && primary[key].trim()) {
        const dropped = [...varsOf(primary[key])].filter((v) => !target.has(v))
        if (dropped.length) {
          report('error', 'interpolation-mismatch', file,
            `${key} — missing {{${dropped.join('}}, {{')}}} that the ${DEFAULT_LANG} value carries;` +
            ` the sentence loses that information in ${lang}.`)
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------
  // CONSTANT FILL: one identical value standing in for many DIFFERENT source strings —
  // a catalogue where every value is the same word (one build filled hi with the literal
  // word "Hindi" in Devanagari). Passes every content test: real target script, no English,
  // no stub. But translation is injective-ish: two or three distinct source strings can
  // legitimately collapse onto one target word (Delete/Remove); four or more cannot.
  // ---------------------------------------------------------------------------------
  for (const entry of readdirSync(defaultDir).filter((e) => e.endsWith('.json'))) {
    const file = path.join(I18N, lang, entry)
    if (!existsSync(file)) continue
    const primary = readCatalog(path.join(defaultDir, entry))
    const catalog = readCatalog(file)
    const byValue = new Map()
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== 'string' || value.trim().length < 2) continue
      if (!byValue.has(value)) byValue.set(value, [])
      byValue.get(value).push(key)
    }
    for (const [value, keys] of byValue) {
      if (keys.length < 4) continue
      const sources = new Set(keys.map((k) => (typeof primary[k] === 'string' ? primary[k].trim() : '')).filter(Boolean))
      if (sources.size < 4) continue // the default language repeats too — a legitimate collapse
      report('error', 'constant-fill', file,
        `${keys.length} keys share the identical value ${JSON.stringify(value.slice(0, 32))} while their` +
        ` ${DEFAULT_LANG} sources are ${sources.size} different strings (${keys.slice(0, 4).join(', ')}…).` +
        ` That is a fill, not a translation — translate each value, or set "" to fall back honestly.`)
    }
  }

  // ---------------------------------------------------------------------------------
  // English sitting in a non-English catalogue. Separate pass: this one walks EVERY key,
  // not only the counted ones, because it is not about plurals at all.
  // ---------------------------------------------------------------------------------
  const targetScript = scriptFor(lang)
  if (!targetScript || targetScript === 'Latn') continue // see scriptFor

  const defaultCatalogs = readdirSync(defaultDir).filter((e) => e.endsWith('.json'))
  for (const entry of defaultCatalogs) {
    const file = path.join(I18N, lang, entry)
    if (!existsSync(file)) continue
    const primary = readCatalog(path.join(defaultDir, entry))
    const catalog = readCatalog(file)

    const untranslated = []
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== 'string' || !value.trim()) continue // empty is HONEST — skip
      if (looksUntranslated(value, targetScript)) {
        untranslated.push(value === primary[key] ? `${key} (identical to ${DEFAULT_LANG})` : key)
        continue
      }
      // HALF-TRANSLATED: target script present, but the sentence is still mostly English —
      // "A clear view of your household money this महीना." One word swapped defeats both the
      // script test (Devanagari is present) and the stub test (the full English no longer
      // embeds intact). Four or more Latin prose words alongside target script is that shape;
      // stubs already reported by containment in the parity pass are skipped.
      const primaryValue = typeof primary[key] === 'string' ? primary[key].trim() : ''
      const isReportedStub = primaryValue.length >= 8 && value.length > primaryValue.length && value.includes(primaryValue)
      if (!isReportedStub && SCRIPT_RANGES[targetScript]?.test(value) && latinProseWords(value) >= 4) {
        report('error', 'mixed-language', file,
          `${key} — ${targetScript} text mixed with an English sentence` +
          ` (${JSON.stringify(value.slice(0, 56))}…): a half-translation. A value is ONE language` +
          ` end to end (brand names and codes excepted); translate the whole sentence or set "".`)
      }
    }

    if (untranslated.length) {
      const shown = untranslated.slice(0, 4).join(', ')
      const rest = untranslated.length > 4 ? `, +${untranslated.length - 4} more` : ''
      report('error', 'untranslated-value', file,
        `${untranslated.length} value(s) carry no ${targetScript} text — ${shown}${rest}` +
        ` (translate them, or set "" for one that genuinely does not change — a brand name —` +
        ` which falls back to ${DEFAULT_LANG} and renders identically)`)
    }
  }
}

// A counted key in the DEFAULT language missing its own required forms is a bug at the source.
for (const [entry, bases] of countedKeys) {
  const catalog = readCatalog(path.join(defaultDir, entry))
  const present = pluralBases(catalog)
  const required = categoriesFor(DEFAULT_LANG) ?? []
  for (const base of bases) {
    const missing = required.filter((form) => !present.get(base)?.has(form))
    if (missing.length) {
      report('error', 'missing-plural-form', path.join(defaultDir, entry),
        `${base} — ${DEFAULT_LANG} needs ${required.join('/')}, missing ${missing.join(', ')}`)
    }
  }
}

// -------------------------------------------------------------------------------------
// A key built from a template literal that resolves to NOTHING. Third pass, language-
// independent: it asks the DEFAULT catalogue, because a key absent there is absent in every
// language. `t(`status.${x}`)` is invisible to extraction, so no key is ever written — and
// `removeUnusedKeys` deletes one that used to exist. The call then renders its defaultValue,
// which is English, in every language.
//
// Three things hide it. The build passes, because supplying a `defaultValue` relaxes
// i18next's key type to plain `string` and the union check never applies. `i18n:lint` reads
// call sites for hardcoded JSX text, not resolvability. And `status` counts the catalogue,
// which never held the key. Measured on a real build: order statuses rendered English on
// three screens with every check green.
//
// Only the STATIC head is checkable (`status.` out of `status.${x}`), so this reports the
// case that cannot possibly work — nothing in the catalogue begins with it. A head that
// matches something is left alone: whether every BRANCH has a key is beyond a regex.
// -------------------------------------------------------------------------------------
// The sanctioned escape hatch for a dynamic key: a preservePatterns glob covering it. Read
// from the app's own config; a config this cannot parse contributes no patterns, which fails
// toward reporting — the message names the right fix either way.
const preservePatterns = (() => {
  const cfg = path.join(ROOT, 'i18next.config.mjs')
  if (!existsSync(cfg)) return []
  const m = /preservePatterns\s*:\s*\[([^\]]*)\]/.exec(readFileSync(cfg, 'utf8'))
  if (!m) return []
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(([, glob]) =>
    new RegExp('^' + glob.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'))
})()

const allDefaultKeys = new Set()
for (const entry of readdirSync(defaultDir)) {
  if (entry.endsWith('.json')) for (const k of Object.keys(readCatalog(path.join(defaultDir, entry)))) allDefaultKeys.add(k)
}

if (allDefaultKeys.size) {
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8')
    const names = new Set(['t'])
    for (const [, alias] of text.matchAll(TRANSLATOR_ALIAS)) names.add(alias)

    const seen = new Set()
    for (const [, head] of text.matchAll(templateKeyCall([...names]))) {
      if (!head || head.length < 2 || seen.has(head)) continue // headless `t(`${k}`)` is unjudgeable
      seen.add(head)
      const resolves = [...allDefaultKeys].some((k) => k.startsWith(head))
      const preserved = preservePatterns.some((rx) => rx.test(head + 'x'))
      if (resolves && preserved) continue // the sanctioned legacy shape (rule*/note*)
      if (!resolves) {
        report('error', 'unresolvable-key', file,
          `t(\`${head}\${…}\`) — no key in ${DEFAULT_LANG} begins with "${head}", so every lookup` +
          ` misses and renders its English defaultValue in EVERY language.` +
          ` Declare a typed lookup (Record<Token, TKey> with vocab()) and render t(LOOKUP[token]).`)
      } else {
        report('error', 'unprotected-dynamic-key', file,
          `t(\`${head}\${…}\`) resolves today, but extraction cannot see it and preservePatterns` +
          ` does not cover "${head}" — the next \`bun run i18n\` DELETES every "${head}*" key from` +
          ` every language. Declare a typed lookup (Record<Token, TKey> with vocab()); do not add` +
          ` a preservePatterns entry for it.`)
      }
    }
  }
}

const errors = problems.filter((p) => p.level === 'error')
const warnings = problems.filter((p) => p.level === 'warn')

for (const p of [...errors, ...warnings]) {
  console.log(`${p.level === 'error' ? 'error' : 'warn '}  ${p.rule.padEnd(24)} ${p.file}  ${p.message}`)
}

if (!problems.length) {
  const counted = [...countedKeys.values()].reduce((n, s) => n + s.size, 0)
  console.log(`plurals OK — ${counted} counted string(s) complete in ${LANGS.length} language(s)`)
}
process.exit(errors.length ? 1 : 0)
