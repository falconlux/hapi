import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { SessionGroup } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useSessionGroupActions(api: ApiClient | null): {
    createGroup: (projectKey: string, name: string) => Promise<SessionGroup>
    renameGroup: (groupId: string, name: string) => Promise<SessionGroup>
    deleteGroup: (groupId: string) => Promise<void>
    moveSessions: (sessionIds: string[], groupId: string | null) => Promise<void>
    renameProject: (projectKey: string, name: string) => Promise<void>
    isPending: boolean
} {
    const queryClient = useQueryClient()
    const invalidate = async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.sessionGroups })
    }

    const createMutation = useMutation({
        mutationFn: async ({ projectKey, name }: { projectKey: string; name: string }) => {
            if (!api) throw new Error('API unavailable')
            return (await api.createSessionGroup(projectKey, name)).group
        },
        onSuccess: () => void invalidate()
    })
    const renameMutation = useMutation({
        mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
            if (!api) throw new Error('API unavailable')
            return (await api.renameSessionGroup(groupId, name)).group
        },
        onSuccess: () => void invalidate()
    })
    const deleteMutation = useMutation({
        mutationFn: async (groupId: string) => {
            if (!api) throw new Error('API unavailable')
            await api.deleteSessionGroup(groupId)
        },
        onSuccess: () => void invalidate()
    })
    const moveMutation = useMutation({
        mutationFn: async ({ sessionIds, groupId }: { sessionIds: string[]; groupId: string | null }) => {
            if (!api) throw new Error('API unavailable')
            await api.moveSessionsToGroup(sessionIds, groupId)
        },
        onSuccess: () => void invalidate()
    })
    const renameProjectMutation = useMutation({
        mutationFn: async ({ projectKey, name }: { projectKey: string; name: string }) => {
            if (!api) throw new Error('API unavailable')
            await api.renameProject(projectKey, name)
        },
        onSuccess: () => void invalidate()
    })

    return {
        createGroup: async (projectKey, name) => await createMutation.mutateAsync({ projectKey, name }),
        renameGroup: async (groupId, name) => await renameMutation.mutateAsync({ groupId, name }),
        deleteGroup: async (groupId) => await deleteMutation.mutateAsync(groupId),
        moveSessions: async (sessionIds, groupId) => await moveMutation.mutateAsync({ sessionIds, groupId }),
        renameProject: async (projectKey, name) => await renameProjectMutation.mutateAsync({ projectKey, name }),
        isPending: createMutation.isPending
            || renameMutation.isPending
            || deleteMutation.isPending
            || moveMutation.isPending
            || renameProjectMutation.isPending
    }
}
