import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { applyClaudeConnection, currentConnectionFingerprint } from './claudeConnection'

describe('applyClaudeConnection', () => {
    let connectionPath: string

    beforeEach(() => {
        connectionPath = join(tmpdir(), `hapi-connection-${process.pid}-${Date.now()}.json`)
        process.env.HAPI_CONNECTION_FILE = connectionPath
        delete process.env.ANTHROPIC_BASE_URL
        delete process.env.ANTHROPIC_AUTH_TOKEN
    })

    afterEach(() => {
        if (existsSync(connectionPath)) {
            unlinkSync(connectionPath)
        }
        delete process.env.HAPI_CONNECTION_FILE
        delete process.env.ANTHROPIC_BASE_URL
        delete process.env.ANTHROPIC_AUTH_TOKEN
    })

    it('sets newapi gateway environment variables from connection file', () => {
        writeFileSync(connectionPath, JSON.stringify({
            _type: 'newapi_channel_conn',
            url: 'https://code-cli.cn',
            key: 'sk-test',
        }))

        applyClaudeConnection()

        expect(process.env.ANTHROPIC_BASE_URL).toBe('https://code-cli.cn')
        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test')
    })

    it('deletes gateway environment variables when connection file is missing', () => {
        process.env.ANTHROPIC_BASE_URL = 'https://code-cli.cn'
        process.env.ANTHROPIC_AUTH_TOKEN = 'sk-test'
        process.env.HAPI_CONNECTION_FILE = join(tmpdir(), `hapi-connection-missing-${process.pid}-${Date.now()}.json`)

        applyClaudeConnection()

        expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    })

    it('deletes gateway environment variables for other connection types', () => {
        process.env.ANTHROPIC_BASE_URL = 'https://code-cli.cn'
        process.env.ANTHROPIC_AUTH_TOKEN = 'sk-test'
        writeFileSync(connectionPath, JSON.stringify({ _type: 'oauth_conn' }))

        applyClaudeConnection()

        expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    })

    it('falls back to OAuth when the connection file is not valid JSON', () => {
        process.env.ANTHROPIC_BASE_URL = 'https://code-cli.cn'
        process.env.ANTHROPIC_AUTH_TOKEN = 'sk-test'
        writeFileSync(connectionPath, 'not-json{')

        applyClaudeConnection()

        expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    })

    it('falls back to OAuth when a newapi connection is missing url/key', () => {
        process.env.ANTHROPIC_BASE_URL = 'https://code-cli.cn'
        process.env.ANTHROPIC_AUTH_TOKEN = 'sk-test'
        writeFileSync(connectionPath, JSON.stringify({ _type: 'newapi_channel_conn', url: 'https://code-cli.cn' }))

        applyClaudeConnection()

        expect(process.env.ANTHROPIC_BASE_URL).toBeUndefined()
        expect(process.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    })

    it('returns oauth fingerprint when connection file is missing', () => {
        expect(currentConnectionFingerprint()).toBe('oauth')
    })

    it('returns trimmed connection file content as fingerprint', () => {
        const content = JSON.stringify({
            _type: 'newapi_channel_conn',
            url: 'https://code-cli.cn',
            key: 'sk-test',
        })
        writeFileSync(connectionPath, `\n${content}\n`)

        expect(currentConnectionFingerprint()).toBe(content)
        expect(currentConnectionFingerprint()).not.toBe('oauth')
    })
})
