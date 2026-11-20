---
name: design-system-default
description: The DEFAULT design system for code apps — shadcn/ui components in src/components/ui plus Tailwind v4 semantic tokens, and the theme policy that goes with it (the planner DOES choose fonts and a palette here and locks them into theme.json). Load this when app/package.json depends on tailwindcss and app/src/components/ui exists. If the app instead depends on @telekom-ods/react-ui-kit-base, load design-system-telekom-ods — the two have opposite theme rules and opposite component sets. Includes a Charts section (recharts rules + a worked chart).
version: 2
---

# Default design system — shadcn/ui + Tailwind

**Which design system is this app on?** Check `app/package.json`:

| package.json has | design system | skill |
| --- | --- | --- |
| `tailwindcss` + `src/components/ui/` | **default** | this one |
| `@telekom-ods/react-ui-kit-base` | **telekom-ods** | `design-system-telekom-ods` |

This app is built from the `designSystem: "default"` scaffold — the one a create request
gets when it sends no selector.

## Components

`app/src/components/ui/` — the shadcn primitives, vendored INTO the app, so they are
yours to read and to edit. `@/components/ui/button`, `…/card`, `…/dialog` and the rest.
Compose with `cn()` from `@/lib/utils`.

There is no per-component documentation folder here; the source IS the documentation.
Read the primitive before you use it — its variants come from `class-variance-authority`
and are visible at the top of the file.

Styling is Tailwind v4 utility classes against the semantic tokens (`bg-background`,
`text-muted-foreground`, `border-border`, `rounded-lg`). Add a package with `bun add`
when the app genuinely needs one.

## Theme: you DO create one

**This is the half that differs most between the two design systems.**

On this design system the planner **owns the app's identity** — fonts, palette, radius —
and locks it into `theme.json` before the builder runs. That is deliberate: a generic
palette is what makes an app look auto-generated, and the builder cannot recover a bland
identity afterwards. Follow the planner's `<design_foundations>` procedure in full: brand
words first, reflex-reject your default font picks, state every choice in `PLAN.md`'s
DESIGN SYSTEM section, and encode it in `theme.json`.

The one exception is a theme the user has PINNED from the platform. That wins, it is
re-asserted every turn, and the `[theme-lock]` block in your context states its actual
values. Do not fight it — see the `theming` skill for the mechanics.

## Charts

Charts are **recharts** (already installed). Never raw divs or SVG. Real data breaks a naive
chart in five ways, and handling every one is mandatory — this is exactly where a generated
chart looks broken (overlapping labels, floating bars, smeared numbers).

1. **Long category labels → HORIZONTAL bars.** Names, "top N" lists, store/customer labels —
   anything that can be long — render as a horizontal bar chart (`layout="vertical"`,
   categories on the `YAxis`) so labels read straight across. A VERTICAL bar chart crushes
   long labels into each other along the x-axis. Give the `YAxis` a `width`, truncate each
   label with its full text in an SVG `<title>`, set `interval={0}`, and scale the chart
   HEIGHT with the row count (~44px per row) so every label gets its own band.
2. **The value axis ALWAYS includes 0** — `domain={[Math.min(0, ...values), Math.max(0, ...values)]}`.
   An all-negative or all-positive series otherwise auto-scales to its own min–max and the
   bar lengths stop being comparable (a −9.6 bar looks as long as a −10.4 one).
3. **Value labels only when sparse (≤ ~8 bars).** NEVER a `<LabelList>` on every bar of a
   dense or GROUPED series — the numbers collide into a smear. The `<Tooltip>` carries exact
   values and a `<Legend>` names the series.
4. **Name the quantity ONCE, keep ticks compact.** The card title names the metric ("Revenue
   by month"). Axis ticks are compact numbers (`1.2k`, `$4M`) — never a unit WORD ("deals")
   repeated on every tick, and never a rotated axis title (it overlaps the ticks; the card
   title already names it).
5. **Every chart sits in a `<Card>`**, coloured from the chart tokens (`var(--chart-1)` …
   `var(--chart-5)`) — never a raw hex, never recharts' default palette.

A correct **horizontal bar chart** — copy this shape (it is the one that breaks most):

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const MAX = 24 // label chars before truncation

export function RankedBars({ data }: { data: { label: string; value: number }[] }) {
  const height = Math.max(data.length * 44 + 48, 160)
  const values = data.map((row) => row.value)
  return (
    <Card>
      <CardHeader><CardTitle>Store comp rankings</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis type="number" domain={[Math.min(0, ...values), Math.max(0, ...values)]}
              tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="label" width={160} interval={0} tickLine={false} axisLine={false}
              tick={({ x, y, payload }) => {
                const full = String(payload.value)
                const short = full.length > MAX ? full.slice(0, MAX - 1) + "…" : full
                return (
                  <text x={x} y={y} dy={4} textAnchor="end" fill="var(--muted-foreground)" fontSize={12}>
                    <title>{full}</title>{short}
                  </text>
                )
              }} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.3 }} formatter={(v) => `${v}%`}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }} />
            <Bar dataKey="value" radius={3} maxBarSize={28} fill="var(--chart-1)" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

Other shapes, SAME five rules:

- **Vertical column** (time / a few short categories): `<BarChart>` with no `layout`, category
  on the `XAxis`, compact `YAxis` ticks, value axis from 0, `maxBarSize`. `<LabelList
  position="top">` only if ≤ ~8 bars. Long category labels? Use the horizontal chart instead.
- **Grouped / stacked** (actual vs target): one `<Bar>` per series, each a chart token, plus a
  `<Legend>`; add the same `stackId` to each `<Bar>` to stack. NO per-bar labels. 0-baseline
  across every series' values.
- **Line / area** (trend over time): `<LineChart>` / `<AreaChart>`, one `<Line>` / `<Area>` per
  series, `<Legend>`, compact ticks. An AREA is anchored at 0; a line may auto-scale its axis.
- **Donut / pie** (part-to-whole, ≤ ~6 slices): `<PieChart>` + `<Pie innerRadius="55%">`, a
  `<Cell fill>` per slice from the tokens, a `<Legend>`, and a tooltip showing the share.

**Reuse without sprawl:** if you render the same KIND of chart on more than one page, extract
ONE small wrapper into `src/components/` (e.g. `BarChart.tsx`) built exactly like the example
above, and import it. Do NOT paste the recharts tree into every page, and do NOT build a
folder of near-duplicate chart files — one wrapper per kind you actually reuse, no more.
