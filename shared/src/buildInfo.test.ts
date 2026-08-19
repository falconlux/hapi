import { describe, expect, it } from 'bun:test'
import { APP_VERSION } from './buildInfo'

// This is the user-visible Web version injected by web/vite.config.ts.
describe('APP_VERSION', () => {
    it('matches the twelfth 0.27.2 custom release', () => {
        expect(APP_VERSION).toBe('0.27.2.12')
    })
})
