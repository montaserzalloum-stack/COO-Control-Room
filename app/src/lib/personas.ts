import { useMemo } from 'react'
import { useGetApiUserContext } from '@unifyapps/app-builder-sdk/hooks/user'

export interface PersonaRef {
  roleId: string
  teamId: string | null
}

/**
 * The personas (from `@/data/personas`) the signed-in user holds: their role, held directly
 * or through the persona's team. Matched by id, never by name: a role of the same name in
 * another app is not one of them. Empty while loading.
 */
export function useMyPersonas<P extends PersonaRef>(
  personas: readonly P[],
  options?: { enabled?: boolean },
): { personas: P[]; isLoading: boolean } {
  const { data, isLoading } = useGetApiUserContext(
    { includeRoles: true, includeTeams: true },
    { query: { enabled: options?.enabled ?? true } },
  )
  const held = useMemo(() => {
    const ids = new Set<string>()
    for (const role of data?.user?.roles ?? []) if (role.id) ids.add(role.id)
    for (const team of data?.user?.teams ?? []) if (team.id) ids.add(team.id)
    return personas.filter((p) => ids.has(p.roleId) || (p.teamId !== null && ids.has(p.teamId)))
  }, [data, personas])
  return { personas: held, isLoading }
}
