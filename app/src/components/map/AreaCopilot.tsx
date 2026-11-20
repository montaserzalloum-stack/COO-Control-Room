import { useMemo, type RefObject } from 'react'
import { Copilot } from '@/components/copilot'

// The real copilot inside <MapAreaTools>' panel. Its own module because <MapAreaTools>
// loads it LAZILY: the copilot pulls the no-code runtime (~2.3 MB gzipped), and a map linked to
// the screen's own copilot (`chat`) never opens this panel.

type AreaCopilotProps = {
  agentId: string
  runtimeContext: Record<string, unknown>
  placeholder: string
  /** where the map's own "Ask" box sends through */
  sendRef: RefObject<((message: string) => void) | null>
}

export default function AreaCopilot({ agentId, runtimeContext, placeholder, sendRef }: AreaCopilotProps) {
  const link = useMemo(() => ({ send: sendRef }), [sendRef])
  return (
    <Copilot
      agentId={agentId}
      size="sm"
      runtimeContext={runtimeContext}
      placeholder={placeholder}
      link={link}
      className="min-h-0 flex-1"
    />
  )
}
