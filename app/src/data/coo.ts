// Live read of the DeliveryOps objects through the do_coo_read workflow (read-only).
// The data source e_6afffd0f4181652aba846dc5 ("do_coo_read") was created on the platform
// with the automation 6afffb65a008e508f9d9f451. The workflow returns one JSON string:
// { ok, read_at, counts, byProject, signals, signalCount, enums, freshness, notes, capacity, repeatBlockers, trend, dataHealth, activity, projects }.
import { useExecuteWorkflowNode } from '@unifyapps/app-builder-sdk/hooks/workflow'

const DATA_SOURCE_ID = 'e_6afffd0f4181652aba846dc5'
const AUTOMATION_ID = '6afffb65a008e508f9d9f451'
const RESOURCE_VERSION = 3240

export interface Signal {
  rule: string
  severity: string
  project: string
  ref: string
  detail: string
}

export interface CooModel {
  ok: boolean
  read_at: number
  scope: string
  counts: Record<string, number>
  byProject: { status: Record<string, number>; phase: Record<string, number> }
  signals: Signal[]
  signalCount: number
  enums: Record<string, Record<string, number>>
  freshness: Record<string, number | null>
  notes: Record<string, unknown>
  capacity?: {
    peopleAllocated: number
    overloaded: number
    overloadedList: Array<{ name: string; total: number; projects: string[] }>
    openEndedRowsNotCounted: number
  }
  dataHealth?: {
    milestonesNotStartedPastDate: number
    projectsWithoutDates: number
    teamRowsWithoutEnd: number
    tasksWithoutDueDate: number
    teamRowsEndedButListed: number
  }
  repeatBlockers?: Record<string, number>
  trend?: Array<Record<string, string | number | undefined>>
  activity?: {
    projects: number
    scanned: number
    withSlackActivity: number
    withEmailActivity: number
    slackNotConnected: number
    emailNotConnected: number
    withTrackerFiles: number
    withSlackChannels: number
    withEmailPatterns: number
  }
  projects?: Array<{
    code: string
    name: string
    status: string
    headline: string
    slackMsgs: number
    gmailMsgs: number
    meetings: number
    slackChannels: number
    gmailPatterns: number
    trackerFiles: number
    scanDone: boolean
    slackSkipped: boolean
    emailSkipped: boolean
  }>
}

function parseModel(raw: unknown): CooModel | undefined {
  const r = raw as { response?: { json?: string }; json?: string } | undefined
  const text = r?.response?.json ?? r?.json
  if (!text) return undefined
  try {
    return JSON.parse(text) as CooModel
  } catch {
    return undefined
  }
}

/** Live DeliveryOps model. Runs as the signed-in viewer, so their DeliveryOps roles apply. */
export function useCooModel() {
  const q = useExecuteWorkflowNode({
    id: DATA_SOURCE_ID,
    context: {
      appName: 'callables',
      resourceName: 'callables_call_automation',
      resourceVersion: RESOURCE_VERSION,
    },
    inputs: {
      automationId: AUTOMATION_ID,
      version: '-1',
      runtimeConnections: {},
      parameters: {},
      synchronous: true,
    },
    options: {},
  } as never)
  const model = parseModel(q.data)
  return { model, loading: q.isLoading, error: q.error, refetch: q.refetch }
}
