import { afterEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from './index'

const tempDirs: string[] = []

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

function makeDbPath(label: string): string {
    const dir = mkdtempSync(join(tmpdir(), `hapi-migration-v24-${label}-`))
    tempDirs.push(dir)
    return join(dir, 'hapi.db')
}

function inspect(dbPath: string): { version: number; tables: Set<string> } {
    const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
    const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    const tables = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
            .map((row) => row.name)
    )
    db.close()
    return { version, tables }
}

describe('schema migration v23 to v24', () => {
    it('adds isolated group tables while preserving sessions and messages', () => {
        const dbPath = makeDbPath('v23')
        let store = new Store(dbPath)
        const session = store.sessions.getOrCreateSession(
            'migration-v23-session',
            { path: '/workspace/project', host: 'test' },
            null,
            'alpha'
        )
        store.messages.addMessage(session.id, { role: 'user', content: { type: 'text', text: 'keep' } })
        store.close()

        const legacy = new Database(dbPath, { create: true, readwrite: true, strict: true })
        legacy.exec(`
            DROP TABLE session_group_memberships;
            DROP TABLE session_groups;
            PRAGMA user_version = 23;
        `)
        legacy.close()

        store = new Store(dbPath)
        expect(store.sessions.getSession(session.id)?.namespace).toBe('alpha')
        expect(store.messages.getMessages(session.id)).toHaveLength(1)
        store.close()

        const { version, tables } = inspect(dbPath)
        expect(version).toBe(24)
        expect(tables).toContain('session_groups')
        expect(tables).toContain('session_group_memberships')
    })

    it('runs the complete v21 to v24 ladder without losing data', () => {
        const dbPath = makeDbPath('v21')
        let store = new Store(dbPath)
        const session = store.sessions.getOrCreateSession(
            'migration-v21-session',
            { path: '/workspace/project', host: 'test' },
            null,
            'alpha'
        )
        store.messages.addMessage(session.id, { role: 'user', content: { type: 'text', text: 'keep' } })
        store.close()

        const legacy = new Database(dbPath, { create: true, readwrite: true, strict: true })
        legacy.exec(`
            DROP TABLE session_group_memberships;
            DROP TABLE session_groups;
            DROP TABLE event_links;
            DROP TABLE events;
            ALTER TABLE sessions DROP COLUMN pinned;
            ALTER TABLE sessions DROP COLUMN global_pinned;
            PRAGMA user_version = 21;
        `)
        legacy.close()

        store = new Store(dbPath)
        const migratedSession = store.sessions.getSession(session.id)
        expect(migratedSession?.pinned).toBe(false)
        expect(migratedSession?.globalPinned).toBe(false)
        expect(store.messages.getMessages(session.id)).toHaveLength(1)
        store.close()

        const { version, tables } = inspect(dbPath)
        expect(version).toBe(24)
        expect(tables).toContain('events')
        expect(tables).toContain('event_links')
        expect(tables).toContain('session_groups')
        expect(tables).toContain('session_group_memberships')
    })

    it('creates a fresh schema directly at v24', () => {
        const dbPath = makeDbPath('empty')
        new Store(dbPath).close()

        const { version, tables } = inspect(dbPath)
        expect(version).toBe(24)
        expect(tables).toContain('sessions')
        expect(tables).toContain('messages')
        expect(tables).toContain('session_groups')
        expect(tables).toContain('session_group_memberships')
    })
})
