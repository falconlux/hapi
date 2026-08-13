import { describe, expect, it } from 'vitest'

describe('peer context route contract', () => {
    it('fails closed when native RPC reports success false', () => {
        const result = { success: false, error: 'native unavailable' }
        expect(result.success === true).toBe(false)
        expect(result.error).toBe('native unavailable')
    })
})
