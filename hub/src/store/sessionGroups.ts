import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import type { StoredProjectDisplayName, StoredSessionGroup, StoredSessionGroupMembership } from './types'

type SessionGroupRow = {
    id: string
    namespace: string
    project_key: string
    name: string
    created_at: number
    updated_at: number
}

type SessionGroupMembershipRow = {
    session_id: string
    group_id: string
    namespace: string
    project_key: string
    updated_at: number
}

type SessionMetadataRow = {
    id: string
    metadata: string | null
}

type ProjectDisplayNameRow = {
    namespace: string
    project_key: string
    name: string
    updated_at: number
}

export function listProjectDisplayNames(db: Database, namespace: string): StoredProjectDisplayName[] {
    const rows = db.prepare(`
        SELECT namespace, project_key, name, updated_at
        FROM project_display_names
        WHERE namespace = ?
        ORDER BY project_key ASC
    `).all(namespace) as ProjectDisplayNameRow[]
    return rows.map((row) => ({
        namespace: row.namespace,
        projectKey: row.project_key,
        name: row.name,
        updatedAt: row.updated_at
    }))
}

export function setProjectDisplayName(
    db: Database,
    namespace: string,
    projectKey: string,
    name: string
): StoredProjectDisplayName {
    const projectExists = (db.prepare(
        'SELECT id, metadata FROM sessions WHERE namespace = ?'
    ).all(namespace) as SessionMetadataRow[]).some(
        (row) => projectKeyFromMetadata(row.metadata) === projectKey
    )
    if (!projectExists) throw new SessionGroupStoreError('invalid-project', 'Project not found')
    const updatedAt = Date.now()
    db.prepare(`
        INSERT INTO project_display_names (namespace, project_key, name, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(namespace, project_key) DO UPDATE SET
            name = excluded.name,
            updated_at = excluded.updated_at
    `).run(namespace, projectKey, name, updatedAt)
    return { namespace, projectKey, name, updatedAt }
}

export type SessionGroupStoreErrorCode = 'not-found' | 'invalid-project'

export class SessionGroupStoreError extends Error {
    constructor(readonly code: SessionGroupStoreErrorCode, message: string) {
        super(message)
        this.name = 'SessionGroupStoreError'
    }
}

function toStoredGroup(row: SessionGroupRow): StoredSessionGroup {
    return {
        id: row.id,
        namespace: row.namespace,
        projectKey: row.project_key,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toStoredMembership(row: SessionGroupMembershipRow): StoredSessionGroupMembership {
    return {
        sessionId: row.session_id,
        groupId: row.group_id,
        namespace: row.namespace,
        projectKey: row.project_key,
        updatedAt: row.updated_at
    }
}

function projectKeyFromMetadata(metadata: string | null): string | null {
    if (!metadata) return null
    try {
        const value = JSON.parse(metadata) as {
            path?: unknown
            worktree?: { basePath?: unknown } | null
        }
        if (typeof value.worktree?.basePath === 'string' && value.worktree.basePath.length > 0) {
            return value.worktree.basePath
        }
        return typeof value.path === 'string' && value.path.length > 0 ? value.path : null
    } catch {
        return null
    }
}

export function listSessionGroups(
    db: Database,
    namespace: string,
    projectKey?: string
): StoredSessionGroup[] {
    const rows = projectKey === undefined
        ? db.prepare(`
            SELECT * FROM session_groups
            WHERE namespace = ?
            ORDER BY project_key ASC, created_at ASC, name COLLATE NOCASE ASC
        `).all(namespace) as SessionGroupRow[]
        : db.prepare(`
            SELECT * FROM session_groups
            WHERE namespace = ? AND project_key = ?
            ORDER BY created_at ASC, name COLLATE NOCASE ASC
        `).all(namespace, projectKey) as SessionGroupRow[]
    return rows.map(toStoredGroup)
}

export function listSessionGroupMemberships(
    db: Database,
    namespace: string,
    projectKey?: string
): StoredSessionGroupMembership[] {
    const rows = projectKey === undefined
        ? db.prepare(`
            SELECT * FROM session_group_memberships
            WHERE namespace = ?
            ORDER BY project_key ASC, updated_at ASC, session_id ASC
        `).all(namespace) as SessionGroupMembershipRow[]
        : db.prepare(`
            SELECT * FROM session_group_memberships
            WHERE namespace = ? AND project_key = ?
            ORDER BY updated_at ASC, session_id ASC
        `).all(namespace, projectKey) as SessionGroupMembershipRow[]
    return rows.map(toStoredMembership)
}

export function getSessionGroup(
    db: Database,
    id: string,
    namespace: string
): StoredSessionGroup | null {
    const row = db.prepare(
        'SELECT * FROM session_groups WHERE id = ? AND namespace = ?'
    ).get(id, namespace) as SessionGroupRow | undefined
    return row ? toStoredGroup(row) : null
}

export function createSessionGroup(
    db: Database,
    namespace: string,
    projectKey: string,
    name: string
): StoredSessionGroup {
    return db.transaction(() => {
        const projectExists = (db.prepare(
            'SELECT id, metadata FROM sessions WHERE namespace = ?'
        ).all(namespace) as SessionMetadataRow[]).some(
            (row) => projectKeyFromMetadata(row.metadata) === projectKey
        )
        if (!projectExists) {
            throw new SessionGroupStoreError('invalid-project', 'Project not found')
        }

        const now = Date.now()
        const group: StoredSessionGroup = {
            id: randomUUID(),
            namespace,
            projectKey,
            name,
            createdAt: now,
            updatedAt: now
        }
        db.prepare(`
            INSERT INTO session_groups (id, namespace, project_key, name, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(group.id, namespace, projectKey, name, now, now)
        return group
    })()
}

export function renameSessionGroup(
    db: Database,
    id: string,
    namespace: string,
    name: string
): StoredSessionGroup | null {
    return db.transaction(() => {
        const now = Date.now()
        const result = db.prepare(`
            UPDATE session_groups
            SET name = ?, updated_at = ?
            WHERE id = ? AND namespace = ?
        `).run(name, now, id, namespace)
        return result.changes > 0 ? getSessionGroup(db, id, namespace) : null
    })()
}

export function deleteSessionGroup(db: Database, id: string, namespace: string): boolean {
    return db.transaction(() => {
        const result = db.prepare(
            'DELETE FROM session_groups WHERE id = ? AND namespace = ?'
        ).run(id, namespace)
        return result.changes > 0
    })()
}

export function setSessionGroupMemberships(
    db: Database,
    namespace: string,
    sessionIds: string[],
    groupId: string | null
): void {
    db.transaction(() => {
        const target = groupId === null
            ? null
            : db.prepare(
                'SELECT * FROM session_groups WHERE id = ? AND namespace = ?'
            ).get(groupId, namespace) as SessionGroupRow | undefined
        if (groupId !== null && !target) {
            throw new SessionGroupStoreError('not-found', 'Group not found')
        }

        const sessions = sessionIds.map((sessionId) => {
            const row = db.prepare(
                'SELECT id, metadata FROM sessions WHERE id = ? AND namespace = ?'
            ).get(sessionId, namespace) as SessionMetadataRow | undefined
            if (!row) {
                throw new SessionGroupStoreError('not-found', `Session not found: ${sessionId}`)
            }
            const projectKey = projectKeyFromMetadata(row.metadata)
            if (!projectKey) {
                throw new SessionGroupStoreError('invalid-project', `Session has no project path: ${sessionId}`)
            }
            if (target && target.project_key !== projectKey) {
                throw new SessionGroupStoreError(
                    'invalid-project',
                    'Session and group belong to different projects'
                )
            }
            return { sessionId, projectKey }
        })

        if (groupId === null) {
            const remove = db.prepare(
                'DELETE FROM session_group_memberships WHERE session_id = ? AND namespace = ?'
            )
            for (const session of sessions) {
                remove.run(session.sessionId, namespace)
            }
            return
        }

        const upsert = db.prepare(`
            INSERT INTO session_group_memberships (
                session_id, group_id, namespace, project_key, updated_at
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                group_id = excluded.group_id,
                namespace = excluded.namespace,
                project_key = excluded.project_key,
                updated_at = excluded.updated_at
        `)
        const now = Date.now()
        for (const session of sessions) {
            upsert.run(session.sessionId, groupId, namespace, session.projectKey, now)
        }
    })()
}
