import { describe, expect, it } from 'bun:test'
import { getCanonicalSessionProjectKey, normalizeSessionProjectKey } from './sessionProject'

describe('session project scope', () => {
    it('prefers the normalized worktree root over the session cwd', () => {
        expect(getCanonicalSessionProjectKey({
            path: '/repo/worktree/subdir',
            worktree: { basePath: '/repo/' }
        })).toBe('/repo')
    })

    it('falls back to a normalized path and preserves filesystem roots', () => {
        expect(getCanonicalSessionProjectKey({ path: '/repo///' })).toBe('/repo')
        expect(normalizeSessionProjectKey('/')).toBe('/')
        expect(normalizeSessionProjectKey('C:\\')).toBe('C:\\')
    })

    it('fails closed when project metadata is absent', () => {
        expect(getCanonicalSessionProjectKey(null)).toBeNull()
        expect(getCanonicalSessionProjectKey({ path: '  ' })).toBeNull()
    })
})
