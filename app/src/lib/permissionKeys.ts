import * as sdkPermissions from '@unifyapps/app-builder-sdk/hooks/permissions'

export interface PermissionKeys {
  has: (key: string) => boolean
  isLoading: boolean
  refetch: () => Promise<unknown>
}

interface CheckOptions {
  enabled?: boolean
}

interface PermissionsEntry {
  // in every SDK with this entry (0.4.0 on); without a required member, an SDK lacking
  // usePermissions is not assignable here (TS2559)
  useRecordAccess: unknown
  usePermissions?: (groupId: string | undefined, options?: CheckOptions) => PermissionKeys
}

// The served SDK can be older than the one the app compiled against. A named import of a missing
// hook stops the whole app at load; through the namespace it is only undefined.
const entry: PermissionsEntry = sdkPermissions

// Without the hook, controls stay visible; the automation still refuses anyone without the key.
const NO_KEY_CHECK: PermissionKeys = {
  has: () => true,
  isLoading: false,
  refetch: () => Promise.resolve(undefined),
}

const usePermissionsFromSdk = entry.usePermissions ?? (() => NO_KEY_CHECK)

/** The signed-in user's keys in one permission group. Read `isLoading` before choosing a request. */
export function usePermissions(groupId: string | undefined, options?: CheckOptions): PermissionKeys {
  return usePermissionsFromSdk(groupId, options)
}

/** Does the signed-in user hold `key` in `groupId`? False while loading. */
export function useHasPermission(
  groupId: string | undefined,
  key: string,
  options?: CheckOptions,
): boolean {
  return usePermissions(groupId, options).has(key)
}

interface CallableBinding {
  automationId: string
  // written into the binding when the brief restricts its automation to a key
  permission?: { readonly groupId: string; readonly key: string }
}

/**
 * May the signed-in user run the automation behind `binding` (from `@/data/callables`)?
 * True when no key restricts it, false while its key loads.
 */
export function useCallableAllowed(binding: CallableBinding, options?: CheckOptions): boolean {
  const { permission } = binding
  const held = useHasPermission(permission?.groupId, permission?.key ?? '', {
    enabled: (options?.enabled ?? true) && permission !== undefined,
  })
  return permission === undefined || held
}
