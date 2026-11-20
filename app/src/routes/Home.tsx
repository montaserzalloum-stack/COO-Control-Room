import { useState } from 'react'
import { useCooModel, type CooModel, type Signal } from '@/data/coo'
import { useExecuteWorkflowNodeMutation } from '@unifyapps/app-builder-sdk/hooks/workflow'

// Look and feel copied from Delivery Operations (orbit.uat.unifyapps.com): cream page,
// dark green header and sidebar, Spectral serif headings, Geist body text.
const C = {
  page: '#FAF9F6',
  ink: '#1A1A18',
  green: '#16351F',
  cream: '#E3D8C2',
  card: '#FFFFFF',
  line: '#E6E1D6',
  muted: '#6B675E',
  red: '#9B2C2C',
  amber: '#9A6B12',
}
const SERIF = "Spectral, ui-serif, Georgia, 'Times New Roman', serif"
const SANS = "Geist, ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif"
const DELIVERY_OPS = 'https://orbit.uat.unifyapps.com/agent-api/preview/b/app-6b0e1602460a/main/projects/'
const FEEDBACK_DS = 'e_6b00103446c1e336ac27cb8b'
const FEEDBACK_AUTO = '6b00102e78687c490ea8f9c3'
const FEEDBACK_RV = 3242

function projectLink(code: string) {
  return DELIVERY_OPS + encodeURIComponent(code)
}

function fmt(ms: number | null | undefined) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' })
}

const RULE_LABEL: Record<string, string> = {
  'OT-1': 'Missed milestones',
  'OT-3': 'Open blockers (issues)',
  'OT-4': 'Use cases at risk, blocked or on hold',
  'OT-6': 'Due within 7 days',
}

function Panel({ title, children, note }: { title?: string; children: React.ReactNode; note?: string }) {
  return (
    <section style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 8, padding: 20 }}>
      {title ? (
        <h3 style={{ fontFamily: SERIF, fontSize: 20, color: C.ink, margin: 0 }}>{title}</h3>
      ) : null}
      {note ? <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 12px' }}>{note}</p> : null}
      <div style={{ marginTop: title ? 12 : 0, fontSize: 14, color: C.ink }}>{children}</div>
    </section>
  )
}

function Tile({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, color: C.muted }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 30, color: C.green, marginTop: 4 }}>{value ?? '—'}</div>
    </div>
  )
}

function SourceLink({ code, label }: { code: string; label?: string }) {
  return (
    <a href={projectLink(code)} target="_blank" rel="noreferrer" style={{ color: C.green, textDecoration: 'underline' }}>
      {label ?? code}
    </a>
  )
}

function FeedbackButtons({ rule, ref }: { rule: string; ref: string }) {
  const [sent, setSent] = useState<string | null>(null)
  const save = useExecuteWorkflowNodeMutation()
  const vote = async (v: string) => {
    try {
      await save.mutateAsync({
        data: {
          context: { appName: 'callables', resourceName: 'callables_call_automation', resourceVersion: FEEDBACK_RV },
          id: FEEDBACK_DS,
          inputs: {
            automationId: FEEDBACK_AUTO,
            version: '-1',
            runtimeConnections: {},
            parameters: { signal_key: rule + '|' + ref, rule_code: rule, vote: v, note: '' },
            synchronous: true,
          },
          options: {},
        },
      } as never)
      setSent(v)
    } catch {
      setSent('error')
    }
  }
  if (sent === 'error') return <span style={{ fontSize: 12, color: C.red }}>Could not save</span>
  if (sent) return <span style={{ fontSize: 12, color: C.muted }}>Thanks: {sent === 'useful' ? 'useful' : 'not useful'}</span>
  return (
    <span style={{ fontSize: 12, display: 'inline-flex', gap: 10 }}>
      <button type="button" onClick={() => vote('useful')} style={{ textDecoration: 'underline', color: C.green, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>Useful</button>
      <button type="button" onClick={() => vote('not_useful')} style={{ textDecoration: 'underline', color: C.muted, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>Not useful</button>
    </span>
  )
}

function SignalLine({ s }: { s: Signal }) {
  return (
    <li style={{ marginBottom: 8 }}>
      <SourceLink code={s.project} /> · {s.ref}: <span style={{ color: C.muted }}>{s.detail}</span>{' '}
      <FeedbackButtons rule={s.rule} ref={s.ref} />
    </li>
  )
}

function Today({ model }: { model: CooModel }) {
  const blockers = model.signals.filter((s) => s.rule === 'OT-3')
  const due = model.signals.filter((s) => s.rule === 'OT-6')
  const atRisk = model.signals.filter((s) => s.rule === 'OT-4')
  const missed = model.signals.filter((s) => s.rule === 'OT-1')
  const tiles: Array<[string, number | undefined]> = [
    ['Projects', model.counts.projects],
    ['Accounts', model.counts.accounts],
    ['Use cases', model.counts.useCases],
    ['RAID escalated', model.counts.raidEscalated],
    ['Milestones', model.counts.milestones],
    ['Open alerts', model.counts.alertsOpen],
    ['Overdue tasks', model.counts.tasksOverdue],
    ['Off-track signals', model.signalCount],
  ]
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {tiles.map(([label, value]) => (
          <Tile key={label} label={label} value={value} />
        ))}
      </div>
      <Panel title="Decisions needed today">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>{blockers.length} open issues have had no update for 3 or more days.</li>
          <li>{model.counts.raidEscalated} RAID items are escalated.</li>
          <li>{model.counts.tasksOverdue} overdue tasks: check stale due dates first.</li>
        </ul>
      </Panel>
      <Panel title="Off track">
        <p style={{ margin: '0 0 8px' }}>
          {missed.length} missed milestones · {atRisk.length} use cases at risk, blocked or on hold · {due.length} due in 7 days · {blockers.length} open blockers
        </p>
        <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Open a project for the detail. Every line links to its DeliveryOps project.</p>
      </Panel>
    </div>
  )
}

function Briefing({ model }: { model: CooModel }) {
  const byRule = (r: string) => model.signals.filter((s) => s.rule === r)
  const missed = byRule('OT-1')
  const atRisk = byRule('OT-4')
  const blockers = byRule('OT-3')
  const due = byRule('OT-6')
  const perProject = new Map<string, number>()
  for (const s of [...missed, ...atRisk]) perProject.set(s.project, (perProject.get(s.project) ?? 0) + 1)
  const byCount = [...perProject.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="1. Decisions needed from you">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          <li>{blockers.length} open issues have had no update for 3 or more days.</li>
          <li>{model.counts.raidEscalated} RAID items are escalated.</li>
          <li>{model.counts.tasksOverdue} overdue tasks: check stale due dates first.</li>
        </ul>
      </Panel>
      <Panel title="2. Off track, and why">
        <p style={{ margin: '0 0 8px' }}>
          {missed.length} missed milestones and {atRisk.length} use cases at risk, blocked or on hold.
        </p>
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {byCount.slice(0, 10).map(([project, n]) => (
            <li key={project}>
              <SourceLink code={project} />: {n} items
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="3. Blocked people and dependencies" note="Owners are not in the signal yet, so they are not shown.">
        {blockers.length === 0 ? (
          <p>No open issues older than 3 days.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {blockers.slice(0, 8).map((s, i) => (
              <SignalLine key={s.ref + '-' + i} s={s} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="4. Customer sentiment" note="Needs the Slack and email connections (not connected yet).">
        <p style={{ margin: 0, color: C.muted }}>Not connected yet.</p>
      </Panel>
      <Panel title="5. Next 7 days">
        {due.length === 0 ? (
          <p>Nothing due in the next 7 days that is not on track.</p>
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {due.slice(0, 10).map((s, i) => (
              <SignalLine key={s.ref + '-' + i} s={s} />
            ))}
          </ul>
        )}
      </Panel>
      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
        Sources: DeliveryOps objects, read live at {fmt(model.read_at)} (Asia/Dubai). Scope: {model.scope}. Signals are
        rule-based (OT-1, OT-3, OT-4, OT-6); check each one before acting.
      </p>
    </div>
  )
}

function Ask({ model }: { model: CooModel }) {
  const questions: Array<{ q: string; rule?: string; text: string }> = [
    { q: 'Which use cases are at risk this month?', rule: 'OT-4', text: 'Use cases at risk, blocked or on hold.' },
    { q: 'Who is blocked?', rule: 'OT-3', text: 'Open issues with no update for 3 or more days.' },
    { q: 'What needs a decision today?', text: 'Escalated RAID items and overdue tasks.' },
    { q: 'What is due in the next 7 days?', rule: 'OT-6', text: 'Milestones due within 7 days and not on track.' },
    { q: 'What is slipping?', rule: 'OT-1', text: 'Milestones past their date and not complete.' },
  ]
  const [picked, setPicked] = useState<number>(0)
  const chosen = questions[picked]
  const rows = chosen.rule ? model.signals.filter((s) => s.rule === chosen.rule) : []
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Ask the COO question" note="Pick a question. Answers come from DeliveryOps, with a link to each source. Free-text questions need the chat feature (not built yet).">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {questions.map((x, i) => (
            <button
              key={x.q}
              type="button"
              onClick={() => setPicked(i)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: "1px solid " + C.line,
                background: i === picked ? C.green : C.card,
                color: i === picked ? C.card : C.ink,
                fontFamily: SANS,
                cursor: 'pointer',
              }}
            >
              {x.q}
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={chosen.q}>
        <p style={{ margin: '0 0 8px', color: C.muted }}>{chosen.text}</p>
        {chosen.rule ? (
          rows.length === 0 ? (
            <p>Nothing matches right now.</p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {rows.slice(0, 25).map((s, i) => (
                <SignalLine key={s.ref + '-' + i} s={s} />
              ))}
            </ul>
          )
        ) : (
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            <li>{model.counts.raidEscalated} RAID items escalated (open the RAID register in DeliveryOps).</li>
            <li>{model.counts.tasksOverdue} overdue tasks (the task list in DeliveryOps).</li>
          </ul>
        )}
      </Panel>
    </div>
  )
}

function Rollup({ model }: { model: CooModel }) {
  const statusRows = Object.entries(model.byProject.status)
  const milestoneRows = Object.entries(model.enums.milestoneStatus ?? {})
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Project health" note="Counts from the live read. Trends over time need a daily history, which is not stored yet.">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {statusRows.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Milestones by status">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {milestoneRows.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Weekly rollup, capacity and repeat blockers" note="Needs weekly history and the resource allocation read. Not built yet.">
        <p style={{ margin: 0, color: C.muted }}>Not built yet.</p>
      </Panel>
    </div>
  )
}

type Threshold = { enabled?: boolean; threshold_days?: number | null; severity?: string | null }

function Settings({ model }: { model: CooModel }) {
  const thresholds = (model as unknown as { thresholds?: Record<string, Threshold> }).thresholds ?? {}
  const rules = Object.entries(thresholds)
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Off-track rules" note="These come from the coo_threshold object. Editing them in the app needs a write workflow (not built yet); change them in the object for now.">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted }}>
              <th style={{ padding: 6 }}>Rule</th>
              <th style={{ padding: 6 }}>Enabled</th>
              <th style={{ padding: 6 }}>Threshold (days)</th>
              <th style={{ padding: 6 }}>Severity</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(([code, t]) => (
              <tr key={code} style={{ borderTop: "1px solid " + C.line }}>
                <td style={{ padding: 6 }}>{code} · {RULE_LABEL[code] ?? code}</td>
                <td style={{ padding: 6 }}>{t.enabled ? 'Yes' : 'No'}</td>
                <td style={{ padding: 6 }}>{t.threshold_days ?? '—'}</td>
                <td style={{ padding: 6 }}>{t.severity ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

// The PDF's requirements, with where each one stands. Kept on the page so the COO and the team can see
// what is done, what is partial, and what is blocked, and by what.
const REQUIREMENTS: Array<{ phase: string; item: string; status: 'Built' | 'Partial' | 'Blocked' | 'Not started'; note: string }> = [
  { phase: '1 Foundation', item: 'Pilot scope (customers and channels)', status: 'Partial', note: 'The app reads all projects and accounts. Channel and mailbox scope is set by the connections.' },
  { phase: '1 Foundation', item: 'Delivery brain as source of truth (stage, owner, date, blockers)', status: 'Built', note: 'Read live from DeliveryOps objects through do_coo_read.' },
  { phase: '1 Foundation', item: 'Excel trackers and plans in one place', status: 'Not started', note: 'Trackers are imported into DeliveryOps. Not read directly yet.' },
  { phase: '1 Foundation', item: 'Definition of off track', status: 'Built', note: 'OT-1, OT-3, OT-4 and OT-6, editable as thresholds. OT-2 and OT-5 need history.' },
  { phase: '1 Foundation', item: "COO's top questions", status: 'Partial', note: 'Five questions are answered on the Ask tab. The COO has not confirmed the final list.' },
  { phase: '2 Daily briefing', item: 'One-page briefing with decisions, off track, blocked, sentiment, 7 days', status: 'Partial', note: 'All six sections are on the page. Sentiment needs Slack and email.' },
  { phase: '2 Daily briefing', item: 'Every item cites its source', status: 'Built', note: 'Each line links to its DeliveryOps project.' },
  { phase: '2 Daily briefing', item: 'Daily accuracy review and feedback', status: 'Built', note: 'Useful and Not useful buttons save to coo_feedback.' },
  { phase: '3 Drill-down', item: 'Chat: "What is the real status of X?"', status: 'Blocked', note: 'Needs a language model step on the app, and the Slack and email sources.' },
  { phase: '3 Drill-down', item: 'Flag where sources disagree', status: 'Blocked', note: 'Needs Slack and email.' },
  { phase: '3 Drill-down', item: 'Saved questions for the weekly review', status: 'Partial', note: "Five fixed questions. Saving the COO's own is not built yet." },
  { phase: '4 Alerts and actions', item: 'Real-time alerts for blockers, slips, frustration, connector issues', status: 'Partial', note: 'Signals are computed on each read. Push alerts need a scheduled run and a channel.' },
  { phase: '4 Alerts and actions', item: 'Claude drafts follow-ups for approval', status: 'Blocked', note: 'Needs a send channel (Slack or email) and an approval step.' },
  { phase: '4 Alerts and actions', item: 'Weekly rollup: trends, repeat blockers, team capacity', status: 'Not started', note: 'Needs weekly history and the resource allocation read.' },
  { phase: '5 Scale', item: 'All customers and channels', status: 'Partial', note: 'All projects and accounts are in scope. Channels wait for the connections.' },
  { phase: '5 Scale', item: 'Adoption and ROI per use case', status: 'Blocked', note: 'No usage data is connected yet.' },
  { phase: '5 Scale', item: 'Platform health and inference cost', status: 'Blocked', note: 'No source connected yet.' },
  { phase: '5 Scale', item: 'Capacity planning (overloaded people, next quarter)', status: 'Not started', note: 'Needs the allocation read.' },
  { phase: 'Risks', item: 'Privacy: no HR or legal threads', status: 'Built', note: 'HR is limited to interviews and onboarding. Legal threads are not read.' },
  { phase: 'Risks', item: 'Accuracy: sources always shown', status: 'Built', note: 'Every item links to its source.' },
  { phase: 'Risks', item: 'Data hygiene owner', status: 'Not started', note: 'Needs a named owner per customer.' },
  { phase: 'Success', item: 'Time spent gathering status goes down', status: 'Not started', note: 'Measure with the COO in Phase 0.' },
]

const TABS = ['Today', 'Briefing', 'Ask', 'Rollup', 'Requirements', 'Settings'] as const
type Tab = (typeof TABS)[number]

function Requirements() {
  const colour: Record<string, string> = { Built: C.green, Partial: C.amber, Blocked: C.red, 'Not started': C.muted }
  const counts = REQUIREMENTS.reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {})
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Requirements from the COO plan" note={Object.entries(counts).map(([k, v]) => k + ': ' + v).join(' · ')}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted }}>
              <th style={{ padding: 6 }}>Phase</th>
              <th style={{ padding: 6 }}>Requirement</th>
              <th style={{ padding: 6 }}>Status</th>
              <th style={{ padding: 6 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {REQUIREMENTS.map((r) => (
              <tr key={r.item} style={{ borderTop: "1px solid " + C.line, verticalAlign: 'top' }}>
                <td style={{ padding: 6, color: C.muted }}>{r.phase}</td>
                <td style={{ padding: 6 }}>{r.item}</td>
                <td style={{ padding: 6, color: colour[r.status], fontWeight: 600 }}>{r.status}</td>
                <td style={{ padding: 6, color: C.muted }}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

export default function Home() {
  const { model, loading, error, refetch } = useCooModel()
  const [tab, setTab] = useState<Tab>('Today')

  return (
    <div style={{ minHeight: '100vh', background: C.page, color: C.ink, fontFamily: SANS }} data-test-id="home-page-container">
      <header style={{ background: C.green, color: C.card, padding: '22px 32px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.cream }}>Delivery Operations</div>
            <h1 style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 400, margin: '4px 0 0' }}>COO Control Room</h1>
            <p style={{ margin: '4px 0 0', color: C.cream, fontSize: 14 }}>Live view of Delivery Operations, read-only</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: C.cream }}>
            <div>Read at {fmt(model?.read_at)}</div>
            <div>{model?.scope ?? ''}</div>
            <button type="button" onClick={() => refetch()} style={{ marginTop: 4, background: 'none', border: 0, color: C.card, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <nav style={{ background: C.card, borderBottom: "1px solid " + C.line }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 4, padding: '0 32px', overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '14px 14px',
                border: 0,
                background: 'none',
                cursor: 'pointer',
                fontFamily: SANS,
                fontSize: 14,
                color: tab === t ? C.green : C.muted,
                borderBottom: tab === t ? "2px solid " + C.green : '2px solid transparent',
                fontWeight: tab === t ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
        {loading && !model ? <p style={{ color: C.muted }}>Reading DeliveryOps…</p> : null}
        {error && !model ? (
          <p style={{ color: C.red }}>Could not read DeliveryOps. Refresh, or check your access.</p>
        ) : null}
        {model ? (
          <>
            {tab === 'Today' ? <Today model={model} /> : null}
            {tab === 'Briefing' ? <Briefing model={model} /> : null}
            {tab === 'Ask' ? <Ask model={model} /> : null}
            {tab === 'Rollup' ? <Rollup model={model} /> : null}
            {tab === 'Requirements' ? <Requirements /> : null}
            {tab === 'Settings' ? <Settings model={model} /> : null}
          </>
        ) : null}
      </main>
    </div>
  )
}
