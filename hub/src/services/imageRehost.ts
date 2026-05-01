/**
 * Walks message content tree, finds Anthropic-style image blocks
 * (`{ type: 'image', source: { type: 'base64'|'url', ... } }`), uploads them
 * to COS, and rewrites the source to point at the permanent CDN URL.
 *
 * Why: Anthropic-hosted image URLs expire and base64 inflates SSE/SQLite.
 * Re-hosting to COS gives stable history and a smaller wire payload.
 */

import { isCosConfigured, uploadToCos } from './cosUpload'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000

type ImageBlock = {
    type: 'image'
    source?: { type?: string; data?: string; media_type?: string; url?: string }
    media_type?: string
    cosFileUrl?: string
} & Record<string, unknown>

type ToolResultBlock = {
    type: 'tool_result'
    content?: unknown
    cosFileUrl?: string
} & Record<string, unknown>

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
        const res = await fetch(url, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!res.ok) return null
        const ct = res.headers.get('content-type') ?? 'application/octet-stream'
        const arr = new Uint8Array(await res.arrayBuffer())
        if (arr.byteLength === 0 || arr.byteLength > MAX_IMAGE_BYTES) return null
        return { buffer: Buffer.from(arr), mimeType: ct.split(';')[0].trim() }
    } catch {
        return null
    }
}

function decodeBase64(data: string, mimeType: string): { buffer: Buffer; mimeType: string } | null {
    try {
        const buf = Buffer.from(data, 'base64')
        if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null
        return { buffer: buf, mimeType }
    } catch {
        return null
    }
}

async function rehostOne(block: ImageBlock, namespace: string): Promise<string | null> {
    if (typeof block.cosFileUrl === 'string' && block.cosFileUrl.length > 0) {
        return block.cosFileUrl
    }
    const source = block.source
    if (!source || typeof source !== 'object') return null

    let blob: { buffer: Buffer; mimeType: string } | null = null
    if (source.type === 'base64' && typeof source.data === 'string') {
        blob = decodeBase64(source.data, source.media_type ?? 'image/png')
    } else if (source.type === 'url' && typeof source.url === 'string') {
        blob = await fetchImageBuffer(source.url)
    }
    if (!blob) return null

    const result = await uploadToCos(blob.buffer, { mimeType: blob.mimeType, namespace })
    if (!result.success || !result.url) return null

    block.cosFileUrl = result.url
    block.source = { type: 'url', url: result.url }
    if (!block.media_type) block.media_type = blob.mimeType
    return result.url
}

function isImageBlock(node: unknown): node is ImageBlock {
    return (
        typeof node === 'object' && node !== null
        && (node as { type?: unknown }).type === 'image'
    )
}

function isToolResultBlock(node: unknown): node is ToolResultBlock {
    return (
        typeof node === 'object' && node !== null
        && (node as { type?: unknown }).type === 'tool_result'
    )
}

type Task = { block: ImageBlock; toolResultParent: ToolResultBlock | null }

function collectImageTasks(content: unknown, parentToolResult: ToolResultBlock | null = null, tasks: Task[] = []): Task[] {
    if (!content || typeof content !== 'object') return tasks

    if (Array.isArray(content)) {
        for (const item of content) collectImageTasks(item, parentToolResult, tasks)
        return tasks
    }

    if (isImageBlock(content)) {
        tasks.push({ block: content, toolResultParent: parentToolResult })
        return tasks
    }

    if (isToolResultBlock(content)) {
        collectImageTasks(content.content, content, tasks)
        return tasks
    }

    // Walk known nested fields without trying to be exhaustive
    const obj = content as Record<string, unknown>
    if (obj.message) collectImageTasks(obj.message, parentToolResult, tasks)
    if (obj.data) collectImageTasks(obj.data, parentToolResult, tasks)
    if (obj.content) collectImageTasks(obj.content, parentToolResult, tasks)
    return tasks
}

export async function rehostImagesInMessage(content: unknown, namespace: string): Promise<unknown> {
    if (!isCosConfigured()) return content
    const tasks = collectImageTasks(content)
    if (tasks.length === 0) return content

    await Promise.all(tasks.map(async ({ block, toolResultParent }) => {
        try {
            const url = await rehostOne(block, namespace)
            if (url && toolResultParent && !toolResultParent.cosFileUrl) {
                toolResultParent.cosFileUrl = url
            }
        } catch (err) {
            console.error('[imageRehost] failed:', err instanceof Error ? err.message : err)
        }
    }))

    return content
}
