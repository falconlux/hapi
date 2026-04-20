import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { configuration } from '../configuration'

const DEFAULT_PASSWORD = 'asdasd'

const entrySchema = z.object({
    hash: z.string(),
    mustChange: z.boolean()
})
const passwordsSchema = z.object({
    passwords: z.record(z.string(), entrySchema)
})
type PasswordsFile = z.infer<typeof passwordsSchema>
type Entry = z.infer<typeof entrySchema>

function getFilePath(): string {
    return join(configuration.dataDir, 'passwords.json')
}

async function readFileSafe(): Promise<PasswordsFile> {
    const path = getFilePath()
    if (!existsSync(path)) {
        return { passwords: {} }
    }
    try {
        const raw = await readFile(path, 'utf8')
        return passwordsSchema.parse(JSON.parse(raw))
    } catch {
        return { passwords: {} }
    }
}

async function writeFileAtomic(data: PasswordsFile): Promise<void> {
    const path = getFilePath()
    const dir = dirname(path)
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true, mode: 0o700 })
    }
    await writeFile(path, JSON.stringify(data, null, 2), { mode: 0o600 })
    await chmod(path, 0o600).catch(() => {})
}

export async function getEntry(namespace: string): Promise<Entry | null> {
    const data = await readFileSafe()
    return data.passwords[namespace] ?? null
}

export async function setEntry(namespace: string, entry: Entry): Promise<void> {
    const data = await readFileSafe()
    data.passwords[namespace] = entry
    await writeFileAtomic(data)
}

export async function ensureDefault(namespace: string): Promise<void> {
    const existing = await getEntry(namespace)
    if (existing) return
    const hash = await Bun.password.hash(DEFAULT_PASSWORD, { algorithm: 'bcrypt', cost: 10 })
    await setEntry(namespace, { hash, mustChange: true })
}

export async function verify(namespace: string, password: string): Promise<{ valid: boolean; mustChange: boolean }> {
    const entry = await getEntry(namespace)
    if (!entry) return { valid: false, mustChange: false }
    const valid = await Bun.password.verify(password, entry.hash)
    return { valid, mustChange: entry.mustChange }
}

export async function changePassword(namespace: string, newPassword: string): Promise<void> {
    if (newPassword.length < 6) throw new Error('Password must be at least 6 characters')
    const hash = await Bun.password.hash(newPassword, { algorithm: 'bcrypt', cost: 10 })
    await setEntry(namespace, { hash, mustChange: false })
}
