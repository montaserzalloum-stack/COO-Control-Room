import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCooModel, type Signal } from '@/data/coo'

const TILES: Array<{ key: string; label: string }> = [
  { key: 'projects', label: 'Projects' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'useCases', label: 'Use cases' },
  { key: 'raid', label: 'RAID items' },
  { key: 'raidEscalated', label: 'RAID escalated' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'alertsOpen', label: 'Open alerts' },
  { key: 'tasksOverdue', label: 'Overdue tasks' },
]

const RULE_LABEL: Record<string, string> = {
  'OT-1': 'Missed milestones',
  'OT-3': 'Open blockers (issues)',
  'OT-4': 'Use cases at risk, blocked or on hold',
  'OT-6': 'Due within 7 days',
}

function fmt(ms: number | null | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })
}

function Tile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-card-foreground">{value ?? '—'}</p>
      </CardContent>
    </Card>
  )
}

function SignalGroup({ rule, items }: { rule: string; items: Signal[] }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-card-foreground">
          {RULE_LABEL[rule] ?? rule} <span className="text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {items.slice(0, 12).map((s, i) => (
            <li key={s.ref + '-' + i} className="flex flex-col">
              <span className="font-medium text-foreground">
                {s.project} · {s.ref}
              </span>
              <span className="text-muted-foreground">{s.detail}</span>
            </li>
          ))}
        </ul>
        {items.length > 12 ? (
          <p className="mt-3 text-xs text-muted-foreground">and {items.length - 12} more</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function Home() {
  const { model, loading, error, refetch } = useCooModel()

  const groups = new Map<string, Signal[]>()
  for (const s of model?.signals ?? []) {
    groups.set(s.rule, [...(groups.get(s.rule) ?? []), s])
  }

  return (
    <div className="min-h-screen bg-background text-foreground" data-test-id="home-page-container">
      <header className="border-b border-border bg-card/60 px-8 py-5" data-test-id="home-header">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground" data-test-id="home-title">
              COO Control Room
            </h1>
            <p className="text-sm text-muted-foreground">Live view of Delivery Operations (read-only)</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Read at {fmt(model?.read_at)}</p>
            <p>{model?.scope ?? ''}</p>
            <button type="button" onClick={() => refetch()} className="mt-1 underline underline-offset-2">
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-8">
        {loading && !model ? <p className="text-muted-foreground">Reading DeliveryOps…</p> : null}
        {error && !model ? (
          <p className="text-destructive">Could not read DeliveryOps. Refresh, or check your access.</p>
        ) : null}

        {model ? (
          <>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {TILES.map((t) => (
                <Tile key={t.key} label={t.label} value={model.counts[t.key]} />
              ))}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                Off track ({model.signalCount} signals)
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {['OT-1', 'OT-3', 'OT-4', 'OT-6']
                  .filter((r) => groups.has(r))
                  .map((r) => (
                    <SignalGroup key={r} rule={r} items={groups.get(r) ?? []} />
                  ))}
              </div>
            </section>

            <section className="text-xs text-muted-foreground">
              <p>
                Data health: {model.counts.tasksOverdue} of {model.counts.tasksOpen} open tasks are overdue. Check
                stale due dates before trusting task alerts. Most missed-milestone signals come from "not started"
                items with past planned dates.
              </p>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
