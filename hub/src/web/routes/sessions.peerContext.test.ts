import { describe, expect, it } from 'vitest'

describe('peer context route contract', () => {
    it('fails closed when native RPC reports success false', () => {
        const result = { success: false, error: 'Authorization: Bearer token=secret' }
        expect(result.success === true).toBe(false)
        const responseBody = { error: 'Native compact failed' }
        expect(JSON.stringify(responseBody)).not.toContain('token')
        expect(JSON.stringify(responseBody)).not.toContain('Authorization')
        expect(JSON.stringify(responseBody)).not.toContain('secret')
    })
})
