import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { CodexModelSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useCodexModels(args: {
    api: ApiClient | null
    machineId?: string | null
    enabled?: boolean
}): {
    models: CodexModelSummary[]
    isLoading: boolean
    error: string | null
} {
    const { api, machineId } = args
    const enabled = Boolean(args.enabled && api && machineId)
    const queryKey = queryKeys.machineCodexModels(machineId ?? 'unknown')

    const query = useQuery({
        queryKey,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            if (machineId) {
                return await api.getMachineCodexModels(machineId)
            }
            throw new Error('Codex models target unavailable')
        },
        enabled,
        staleTime: 30_000,
        // One transient runner/proxy failure should not disable the selector
        // until the user reloads the whole application.
        retry: 1,
        retryDelay: 1_000,
    })

    return {
        models: query.data?.models ?? [],
        isLoading: query.isLoading,
        error: query.data?.success === false
            ? (query.data.error ?? 'Failed to load Codex models')
            : query.error instanceof Error
                ? query.error.message
                : query.error
                    ? 'Failed to load Codex models'
                    : null,
    }
}
