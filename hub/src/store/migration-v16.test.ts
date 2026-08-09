import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from './index'

describe('Store V16->V21 migration: usage index ladder', () => {
    it('creates every derived usage table and preserves session messages', () => {
        const directory = mkdtempSync(join(tmpdir(), 'hapi-migration-v16-to-v21-'))
        const dbPath = join(directory, 'test.db')
        let store: Store | undefined

        try {
            store = new Store(dbPath)
            const session = store.sessions.getOrCreateSession(
                'session-1',
                { path: '/tmp', host: 'test', flavor: 'claude' },
                null,
                'default'
            )
            store.messages.addMessage(session.id, {
                role: 'user',
                content: { type: 'text', text: 'preserve me' }
            })
            store.close()
            store = undefined

            const db = new Database(dbPath, { create: true, readwrite: true, strict: true })
            db.exec(`
                DROP TABLE usage_scan_state;
                DROP TABLE usage_events;
                PRAGMA user_version = 16;
            `)
            db.close()

            store = new Store(dbPath)
            const internalDb = (store as unknown as { db: Database }).db
            const tableNames = new Set(
                (internalDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
                    .map((row) => row.name)
            )
            const usageColumns = new Set(
                (internalDb.prepare('PRAGMA table_info(usage_events)').all() as Array<{ name: string }>)
                    .map((row) => row.name)
            )
            const version = internalDb.prepare('PRAGMA user_version').get() as { user_version: number }

            expect(version.user_version).toBe(21)
            expect(tableNames).toContain('usage_events')
            expect(tableNames).toContain('usage_scan_state')
            expect(usageColumns).toContain('last_input_tokens')
            expect(usageColumns).toContain('last_output_tokens')
            expect(usageColumns).toContain('last_cache_read_tokens')
            expect(usageColumns).toContain('last_cache_creation_tokens')
            expect(store.messages.getMessages(session.id)).toHaveLength(1)
        } finally {
            store?.close()
            rmSync(directory, { recursive: true, force: true })
        }
    })
})
