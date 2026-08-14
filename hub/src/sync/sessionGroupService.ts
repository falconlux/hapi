import type { SessionGroup, SessionGroupsResponse } from '@hapi/protocol/types'
import type { SessionGroupStore } from '../store/sessionGroupStore'
import { SessionGroupStoreError } from '../store/sessionGroups'
import type { EventPublisher } from './eventPublisher'

export type SessionGroupErrorCode = 'not-found' | 'conflict' | 'invalid-project'

export class SessionGroupError extends Error {
    constructor(readonly code: SessionGroupErrorCode, message: string) {
        super(message)
        this.name = 'SessionGroupError'
    }
}

export class SessionGroupService {
    constructor(
        private readonly store: SessionGroupStore,
        private readonly publisher: EventPublisher
    ) {
    }

    list(namespace: string, projectKey?: string): SessionGroupsResponse {
        return {
            groups: this.store.list(namespace, projectKey).map((group) => this.toGroup(group)),
            memberships: this.store.listMemberships(namespace, projectKey).map((membership) => ({
                sessionId: membership.sessionId,
                groupId: membership.groupId,
                projectKey: membership.projectKey,
                updatedAt: membership.updatedAt
            })),
            projects: this.store.listProjectDisplayNames(namespace).map((project) => ({
                projectKey: project.projectKey,
                name: project.name,
                updatedAt: project.updatedAt
            }))
        }
    }

    renameProject(namespace: string, projectKey: string, name: string) {
        try {
            const project = this.store.setProjectDisplayName(namespace, projectKey, name)
            this.publish(namespace)
            return { projectKey: project.projectKey, name: project.name, updatedAt: project.updatedAt }
        } catch (error) {
            throw this.mapStoreError(error)
        }
    }

    create(namespace: string, projectKey: string, name: string): SessionGroup {
        try {
            const group = this.store.create(namespace, projectKey, name)
            this.publish(namespace)
            return this.toGroup(group)
        } catch (error) {
            throw this.mapStoreError(error)
        }
    }

    rename(namespace: string, groupId: string, name: string): SessionGroup {
        try {
            const group = this.store.rename(groupId, namespace, name)
            if (!group) {
                throw new SessionGroupError('not-found', 'Group not found')
            }
            this.publish(namespace)
            return this.toGroup(group)
        } catch (error) {
            if (error instanceof SessionGroupError) throw error
            throw this.mapStoreError(error)
        }
    }

    delete(namespace: string, groupId: string): void {
        try {
            if (!this.store.delete(groupId, namespace)) {
                throw new SessionGroupError('not-found', 'Group not found')
            }
            this.publish(namespace)
        } catch (error) {
            if (error instanceof SessionGroupError) throw error
            throw this.mapStoreError(error)
        }
    }

    moveSessions(namespace: string, sessionIds: string[], groupId: string | null): void {
        try {
            this.store.setMemberships(namespace, sessionIds, groupId)
            this.publish(namespace)
        } catch (error) {
            throw this.mapStoreError(error)
        }
    }

    private toGroup(group: {
        id: string
        projectKey: string
        name: string
        createdAt: number
        updatedAt: number
    }): SessionGroup {
        return {
            id: group.id,
            projectKey: group.projectKey,
            name: group.name,
            createdAt: group.createdAt,
            updatedAt: group.updatedAt
        }
    }

    private publish(namespace: string): void {
        this.publisher.emit({ type: 'session-groups-updated', namespace })
    }

    private mapStoreError(error: unknown): Error {
        if (error instanceof SessionGroupStoreError) {
            return new SessionGroupError(error.code, error.message)
        }
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
            return new SessionGroupError('conflict', 'A group with this name already exists')
        }
        return error instanceof Error ? error : new Error(String(error))
    }
}
