import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCooModel, type CooModel, type Signal } from '@/data/coo'

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

function countByProject(items: Signal[]) {
  const m = new Map<string, number>()
  for (const s of items) m.set(s.project, (m.get(s.project) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-card-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-foreground">{children}</CardContent>
    </Card>
  )
}

function Briefing({ model }: { model: CooModel }) {
  const byRule = (r: string) => model.signals.filter((s) => s.rule === r)
  const missed = byRule('OT-1')
  const atRisk = byRule('OT-4')
  const blockers = byRule('OT-3')
  const due = byRule('OT-6')
  const offTrackProjects = countByProject([...missed, ...atRisk])

  return (
    <section className="space-y-4" data-test-id="briefing">
      <h2 className="text-lg font-semibold text-foreground">Daily briefing</h2>

      <BriefSection title="1. Decisions needed from you">
        <ul className="list-disc space-y-1 pl-5">
          <li>{blockers.length} open issues have had no update for 3 or more days.</li>
          <li>{model.counts.raidEscalated} RAID items are escalated.</li>
          <li>{model.counts.tasksOverdue} overdue tasks: check stale due dates first.</li>
        </ul>
      </BriefSection>

      <BriefSection title="2. Off track, and why">
        <p className="mb-2">
          {missed.length} missed milestones and {atRisk.length} use cases at risk, blocked or on hold.
        </p>
        <ul className="space-y-1">
          {offTrackProjects.slice(0, 8).map(([project, n]) => (
            <li key={project}>
              <span className="font-medium">{project}</span>: {n} items
            </li>
          ))}
        </ul>
      </BriefSection>

      <BriefSection title="3. Blocked people and dependencies">
        {blockers.length === 0 ? (
          <p>No open issues older than 3 days.</p>
        ) : (
          <ul className="space-y-1">
            {blockers.slice(0, 8).map((s, i) => (
              <li key={s.ref + '-' + i}>
                <span className="font-medium">{s.project} · {s.ref}</span>: {s.detail}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Owners are not shown yet: the signal does not carry them.</p>
      </BriefSection>

      <BriefSection title="4. Customer sentiment">
        <p className="text-muted-foreground">Not connected yet. Slack and email are added after the objects read is verified.</p>
      </BriefSection>

      <BriefSection title="5. Next 7 days">
        {due.length === 0 ? (
          <p>Nothing due in the next 7 days that is not on track.</p>
        ) : (
          <ul className="space-y-1">
            {due.slice(0, 10).map((s, i) => (
              <li key={s.ref + '-' + i}>
                <span className="font-medium">{s.project} · {s.ref}</span>: {s.detail}
              </li>
            ))}
          </ul>
        )}
      </BriefSection>

      <p className="text-xs text-muted-foreground">
        Sources: DeliveryOps objects, read live at {fmt(model.read_at)} (Asia/Dubai). Scope: {model.scope}. Signals
        are rule-based (OT-1, OT-3, OT-4, OT-6); check each one before acting.
      </p>
    </section>
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

            <Briefing model={model} />

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
