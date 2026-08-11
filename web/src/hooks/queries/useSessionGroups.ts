import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SessionGroup, SessionGroupMembership } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSessionGroups(api: ApiClient | null): {
    groups: SessionGroup[]
    memberships: SessionGroupMembership[]
    isLoading: boolean
    error: string | null
} {
    const query = useQuery({
        queryKey: queryKeys.sessionGroups,
        queryFn: async () => {
            if (!api || typeof api.getSessionGroups !== 'function') {
                return { groups: [], memberships: [] }
            }
            return await api.getSessionGroups()
        },
        enabled: Boolean(api)
    })

    return {
        groups: query.data?.groups ?? [],
        memberships: query.data?.memberships ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error
            ? query.error.message
            : query.error
                ? 'Failed to load session groups'
                : null
    }
}
