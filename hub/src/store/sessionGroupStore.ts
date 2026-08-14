import type { Database } from 'bun:sqlite'
import type { StoredProjectDisplayName, StoredSessionGroup, StoredSessionGroupMembership } from './types'
import {
    createSessionGroup,
    deleteSessionGroup,
    getSessionGroup,
    listSessionGroupMemberships,
    listSessionGroups,
    listProjectDisplayNames,
    renameSessionGroup,
    setProjectDisplayName,
    setSessionGroupMemberships
} from './sessionGroups'

export class SessionGroupStore {
    constructor(private readonly db: Database) {
    }

    list(namespace: string, projectKey?: string): StoredSessionGroup[] {
        return listSessionGroups(this.db, namespace, projectKey)
    }

    listProjectDisplayNames(namespace: string): StoredProjectDisplayName[] {
        return listProjectDisplayNames(this.db, namespace)
    }

    setProjectDisplayName(namespace: string, projectKey: string, name: string): StoredProjectDisplayName {
        return setProjectDisplayName(this.db, namespace, projectKey, name)
    }

    listMemberships(namespace: string, projectKey?: string): StoredSessionGroupMembership[] {
        return listSessionGroupMemberships(this.db, namespace, projectKey)
    }

    get(id: string, namespace: string): StoredSessionGroup | null {
        return getSessionGroup(this.db, id, namespace)
    }

    create(namespace: string, projectKey: string, name: string): StoredSessionGroup {
        return createSessionGroup(this.db, namespace, projectKey, name)
    }

    rename(id: string, namespace: string, name: string): StoredSessionGroup | null {
        return renameSessionGroup(this.db, id, namespace, name)
    }

    delete(id: string, namespace: string): boolean {
        return deleteSessionGroup(this.db, id, namespace)
    }

    setMemberships(namespace: string, sessionIds: string[], groupId: string | null): void {
        setSessionGroupMemberships(this.db, namespace, sessionIds, groupId)
    }
}
