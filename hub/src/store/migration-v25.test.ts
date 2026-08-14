import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Store } from './index'

describe('schema v25 project display names', () => {
    it('creates the namespace-scoped durable table on v24 upgrade', () => {
        const dir = mkdtempSync(join(tmpdir(), 'hapi-v25-'))
        const path = join(dir, 'hapi.db')
        const db = new Database(path)
        db.exec('PRAGMA user_version = 24;')
        db.close()
        const store = new Store(path)
        const verify = new Database(path)
        const check = verify.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_display_names'").get()
        expect(check).toBeDefined()
        expect((verify.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(25)
        verify.close()
        store.close()
        rmSync(dir, { recursive: true, force: true })
    })
})
