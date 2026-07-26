import type { ToolGroupBlock } from '@/chat/toolGroups'
import type { ToolCallBlock } from '@/chat/types'
import type { SessionMetadataSummary } from '@/types/api'
import { isObject } from '@hapi/protocol'
import { isEnglishCodexActivityTitle, localizeCodexActivityTitle } from '@/lib/codexActivityTitle'
import type { Locale } from '@/lib/i18n-context'
import { getInputStringAny } from '@/lib/toolInputUtils'
import { basename, resolveDisplayPath } from '@/utils/path'

type Translator = (key: string, params?: Record<string, string | number>) => string

export type GroupedSummaryIntent =
    | 'inspect-files'
    | 'search-content'
    | 'run-project-command'
    | 'modify-files'
    | 'open-web'
    | 'generic-command'
    | 'generic-tool'

const SAFE_PROJECT_COMMAND_RE = /^(?:(?:bun|npm|pnpm|yarn) (?:run )?(?:test|lint|build|typecheck)(?:[:\w.-]*)|git (?:status|diff|log)(?:\s+--?[\w.-]+)*|cargo (?:test|check)|go test(?:\s+\.\/\.\.\.)?|pytest(?:\s+-[\w-]+)*)$/i
const SENSITIVE_TEXT_RE = /(?:bearer\s+\S+|(?:api[_-]?key|token|password|secret)(?:\s*[:=]\s*\S+|\s+\S{12,})|(?:gh[pousr]_|github_pat_|sk-[a-z0-9_-]*|xox[baprs]-)[a-z0-9_-]{12,}|[a-f0-9]{32,}|[a-z0-9_+/=-]{40,})/i
const SENSITIVE_PATH_TEXT_RE = /(?:bearer\s+\S+|(?:api[_-]?key|token|password|secret)\s*[:=]\s*\S+)/i
const SENSITIVE_PATH_SEGMENT_RE = /^(?:(?:gh[pousr]_|github_pat_|sk-|xox[baprs]-)[a-z0-9_-]{12,}|[a-f0-9]{32,}|[a-z0-9_+=-]{40,})$/i
const SEARCH_OPTIONS_WITH_VALUE = new Set([
    '-g', '--glob', '-t', '--type', '-A', '-B', '-C', '--context',
    '--before-context', '--after-context', '-m', '--max-count'
])
const MAX_SPECIFIC_LABEL_LENGTH = 72
const GENERIC_ACTIVITY_TITLE_RE = /^(?:(?:inspect(?:ing)?|check(?:ing)?|review(?:ing)?|read(?:ing)?|explor(?:e|ing)|search(?:ing)?|run(?:ning)?|execut(?:e|ing))\s+(?:(?:the\s+)?(?:project|repo(?:sitory)?|codebase)\s+)?(?:files?|code|content|structure|commands?|tools?)|(?:tool|command)\s+activity)$/i
const GENERIC_ACTIVITY_TITLE_ZH_RE = /^(?:(?:检查|查看|阅读|浏览|探索|搜索|运行|执行)(?:项目|仓库|代码库)?(?:文件|代码|内容|结构|命令|工具)|工具活动|执行命令|使用工具)$/
const INSPECTION_EXECUTABLE_RE = /^(?:get-childitem|ls|dir|get-content|cat|type|tree|sed|nl|head|tail|find)$/i
const SEARCH_EXECUTABLE_RE = /^(?:rg|grep|select-string|findstr)$/i
const SHELL_TOOL_NAMES = new Set(['Bash', 'CodexBash', 'shell_command', 'run_shell_command'])

function truncateLabel(value: string): string {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return normalized.length > MAX_SPECIFIC_LABEL_LENGTH
        ? `${normalized.slice(0, MAX_SPECIFIC_LABEL_LENGTH - 1)}…`
        : normalized
}

function safeLabelValue(value: string | null): string | null {
    if (!value || SENSITIVE_TEXT_RE.test(value)) return null
    return truncateLabel(value)
}

function safePathValue(value: string | null): string | null {
    if (!value) return null
    const normalized = value.replace(/[\r\n\t]+/g, ' ').trim()
    if (!normalized || SENSITIVE_PATH_TEXT_RE.test(normalized)) return null
    if (/^(?:\.{1,2}[\\/]*|[\\/])$/.test(normalized)) return null

    const segments = normalized.replace(/\\/g, '/').split('/').filter(Boolean)
    if (segments.some((segment) => SENSITIVE_PATH_SEGMENT_RE.test(segment))) return null
    return normalized
}

function splitShellCommand(command: string): string[] {
    const segments: string[] = []
    let start = 0
    let quote: "'" | '"' | null = null
    let escaped = false

    const push = (end: number) => {
        const segment = command.slice(start, end).trim()
        if (segment) segments.push(segment)
    }

    for (let index = 0; index < command.length; index += 1) {
        const char = command[index]

        if (escaped) {
            escaped = false
            continue
        }
        if (char === '\\' && quote !== "'") {
            escaped = true
            continue
        }
        if (quote) {
            if (char === quote) quote = null
            continue
        }
        if (char === "'" || char === '"') {
            quote = char
            continue
        }

        if (char === '#' && (index === 0 || /\s/.test(command[index - 1]))) {
            push(index)
            while (index + 1 < command.length && command[index + 1] !== '\n') index += 1
            start = index + 1
            continue
        }

        if (char === '\n' || char === ';' || char === '|' || char === '&') {
            push(index)
            while (index + 1 < command.length && command[index + 1] === char) index += 1
            start = index + 1
        }
    }

    push(command.length)
    return segments
}

function simpleCommandParts(command: string): string[] | null {
    if (/[<>$`(){}\n\r]/.test(command)) return null
    const parts = command.match(/(?:[^\s"']+|"(?:\\.|[^"])*"|'[^']*')+/g)
    return parts?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? null
}

function getExecutable(parts: string[]): string | null {
    const first = parts[0]
    if (!first) return null
    return basename(first).replace(/\.exe$/i, '')
}

function isSearchCommand(command: string): boolean {
    return splitShellCommand(command).some((segment) => {
        const parts = simpleCommandParts(segment)
        const executable = parts ? getExecutable(parts) : null
        return executable ? SEARCH_EXECUTABLE_RE.test(executable) : false
    })
}

function isInspectionCommand(command: string): boolean {
    return splitShellCommand(command).some((segment) => {
        const parts = simpleCommandParts(segment)
        const executable = parts ? getExecutable(parts) : null
        if (!parts || !executable || !INSPECTION_EXECUTABLE_RE.test(executable)) return false
        return executable.toLowerCase() !== 'sed' || parts.some((part) => part === '-n' || part.startsWith('-n'))
    })
}

function isInspectionArgument(value: string): boolean {
    if (!value || value.startsWith('-')) return false
    if (/^\d+$/.test(value)) return false
    if (/^\d+(?:,\d+)?p$/.test(value)) return false
    if (/^\/.*\/[a-z]*$/i.test(value)) return false
    return true
}

function getInspectionCommandTargets(command: string): string[] {
    const targets: string[] = []
    const push = (value: string | null) => {
        const target = safePathValue(value)
        if (target && !targets.includes(target)) targets.push(target)
    }

    for (const segment of splitShellCommand(command)) {
        const parts = simpleCommandParts(segment)
        if (!parts || parts.length < 2) continue
        const executable = getExecutable(parts)
        if (!executable || !INSPECTION_EXECUTABLE_RE.test(executable)) continue
        if (executable.toLowerCase() === 'sed' && !parts.some((part) => part === '-n' || part.startsWith('-n'))) continue

        const normalizedExecutable = executable.toLowerCase()
        if (normalizedExecutable === 'find') {
            const target = parts.slice(1).find(isInspectionArgument)
            push(target ?? null)
            continue
        }

        const explicitPathIndex = parts.findIndex((part) => /^-(?:literal)?path$/i.test(part))
        if (explicitPathIndex >= 0) {
            push(parts[explicitPathIndex + 1] ?? null)
            continue
        }

        const target = parts.slice(1).reverse().find(isInspectionArgument)
        push(target ?? null)
    }
    return targets
}

function getSearchCommandDetails(command: string): { pattern: string | null; scope: string | null } {
    for (const segment of splitShellCommand(command)) {
        const parts = simpleCommandParts(segment)
        if (!parts) continue
        const executable = getExecutable(parts)
        if (!executable || !SEARCH_EXECUTABLE_RE.test(executable)) continue

        let pattern: string | null = null
        let scope: string | null = null
        for (let index = 1; index < parts.length; index += 1) {
            const part = parts[index]
            if (part.startsWith('-')) {
                if (SEARCH_OPTIONS_WITH_VALUE.has(part)) index += 1
                continue
            }
            if (!pattern) {
                pattern = safeLabelValue(part)
                continue
            }
            scope = safePathValue(part)
        }
        if (pattern || scope) return { pattern, scope }
    }
    return { pattern: null, scope: null }
}

function getSearchCommandPattern(command: string): string | null {
    return getSearchCommandDetails(command).pattern
}

function getSearchCommandScope(command: string): string | null {
    return getSearchCommandDetails(command).scope
}

function getCommandText(input: unknown): string | null {
    const direct = getInputStringAny(input, ['command', 'cmd'])
    if (direct) return direct

    if (!input || typeof input !== 'object') return null
    const command = (input as { command?: unknown }).command
    if (!Array.isArray(command)) return null

    const parts = command.filter((part): part is string => typeof part === 'string' && part.length > 0)
    return parts.length > 0 ? parts.join(' ') : null
}

function getIntentLabel(intent: GroupedSummaryIntent, t: Translator): string {
    switch (intent) {
        case 'inspect-files':
            return t('toolGroup.friendly.inspectFiles')
        case 'search-content':
            return t('toolGroup.friendly.searchContent')
        case 'run-project-command':
            return t('toolGroup.friendly.runCommands')
        case 'modify-files':
            return t('toolGroup.friendly.editFiles')
        case 'open-web':
            return t('toolGroup.friendly.openWeb')
        case 'generic-command':
            return t('toolGroup.friendly.genericCommand')
        default:
            return t('toolGroup.friendly.genericTool')
    }
}

function normalizeNativeKind(value: string | null | undefined): 'read' | 'search' | 'execute' | 'edit' | 'web' | null {
    const kind = value?.toLowerCase().trim()
    if (!kind) return null
    if (['read', 'read_file', 'file_read', 'view'].includes(kind)) return 'read'
    if (['search', 'grep', 'find', 'glob'].includes(kind)) return 'search'
    if (['execute', 'shell', 'bash', 'run', 'run_shell', 'run_shell_command', 'cmd', 'terminal'].includes(kind)) return 'execute'
    if (['edit', 'write', 'write_file', 'replace', 'file_edit', 'modify'].includes(kind)) return 'edit'
    if (['web', 'browse', 'fetch'].includes(kind)) return 'web'
    return null
}

function getParsedCommandIntent(input: unknown): GroupedSummaryIntent | null {
    if (!isObject(input) || !Array.isArray(input.parsed_cmd)) return null
    const kinds = input.parsed_cmd
        .filter(isObject)
        .map((item) => normalizeNativeKind(typeof item.type === 'string' ? item.type : null))
    if (kinds.includes('edit')) return 'modify-files'
    if (kinds.includes('search')) return 'search-content'
    if (kinds.includes('read')) return 'inspect-files'
    if (kinds.includes('execute')) return 'run-project-command'
    return null
}

export function inferGroupedSummaryIntent(tool: ToolCallBlock): GroupedSummaryIntent {
    const toolName = tool.tool.name
    const command = getCommandText(tool.tool.input)
    const nativeKind = normalizeNativeKind(tool.tool.nativeKind)

    if (nativeKind === 'edit') return 'modify-files'
    if (nativeKind === 'read') return 'inspect-files'
    if (nativeKind === 'search') return 'search-content'
    if (nativeKind === 'web') return 'open-web'

    const parsedIntent = getParsedCommandIntent(tool.tool.input)
    if (parsedIntent) return parsedIntent

    if (toolName === 'Read' || toolName === 'LS' || toolName === 'NotebookRead') {
        return 'inspect-files'
    }
    if (toolName === 'Grep' || toolName === 'Glob') {
        return 'search-content'
    }
    if (toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write' || toolName === 'NotebookEdit' || toolName === 'CodexPatch' || toolName === 'CodexDiff') {
        return 'modify-files'
    }
    if (toolName === 'WebFetch' || toolName === 'WebSearch') {
        return 'open-web'
    }

    if (SHELL_TOOL_NAMES.has(toolName) || nativeKind === 'execute' || command) {
        if (command && isSearchCommand(command)) {
            return 'search-content'
        }
        if (command && isInspectionCommand(command)) {
            return 'inspect-files'
        }
        return 'run-project-command'
    }

    return 'generic-tool'
}

function getPrimaryIntent(block: ToolGroupBlock): GroupedSummaryIntent {
    const counts = new Map<GroupedSummaryIntent, number>()
    const order: GroupedSummaryIntent[] = []

    for (const tool of block.tools) {
        const intent = inferGroupedSummaryIntent(tool)
        if (!counts.has(intent)) {
            order.push(intent)
        }
        counts.set(intent, (counts.get(intent) ?? 0) + 1)
    }

    let primary: GroupedSummaryIntent = 'generic-tool'
    let maxCount = -1

    for (const intent of order) {
        const count = counts.get(intent) ?? 0
        if (count > maxCount) {
            primary = intent
            maxCount = count
        }
    }

    return primary
}

function getIntentSet(block: ToolGroupBlock): Set<GroupedSummaryIntent> {
    return new Set(block.tools.map(inferGroupedSummaryIntent))
}

function isGenericActivityTitle(value: string, t: Translator): boolean {
    const normalized = value.replace(/\s+/g, ' ').trim()
    const localizedGenericTitles = [
        t('toolGroup.title'),
        getIntentLabel('inspect-files', t),
        getIntentLabel('search-content', t),
        getIntentLabel('run-project-command', t),
        getIntentLabel('modify-files', t),
        getIntentLabel('open-web', t),
        getIntentLabel('generic-command', t),
        getIntentLabel('generic-tool', t),
    ]
    return localizedGenericTitles.some((title) => title.toLocaleLowerCase() === normalized.toLocaleLowerCase())
        || GENERIC_ACTIVITY_TITLE_RE.test(normalized)
        || GENERIC_ACTIVITY_TITLE_ZH_RE.test(normalized)
}

function getDiffTargets(input: unknown): string[] {
    const unified = getInputStringAny(input, ['unified_diff'])
    if (!unified) return []
    const targets: string[] = []
    for (const line of unified.split('\n')) {
        if (!line.startsWith('+++ ')) continue
        const target = safePathValue(line.replace(/^\+\+\+ (?:b\/)?/, ''))
        if (!target || target === '/dev/null' || targets.includes(target)) continue
        targets.push(target)
    }
    return targets
}

function getToolFileTargets(tool: ToolCallBlock): string[] {
    const targets: string[] = []
    const push = (value: string | null) => {
        const target = safePathValue(value)
        if (target && !targets.includes(target)) targets.push(target)
    }

    push(getInputStringAny(tool.tool.input, ['file_path', 'path', 'file', 'filePath', 'notebook_path']))

    if (isObject(tool.tool.input) && Array.isArray(tool.tool.input.parsed_cmd)) {
        for (const parsed of tool.tool.input.parsed_cmd) {
            if (!isObject(parsed)) continue
            const kind = normalizeNativeKind(typeof parsed.type === 'string' ? parsed.type : null)
            if (kind === 'read' || kind === 'edit') {
                push(typeof parsed.name === 'string' ? parsed.name : null)
            }
        }
    }

    if (tool.tool.name === 'CodexPatch' && isObject(tool.tool.input) && isObject(tool.tool.input.changes)) {
        for (const target of Object.keys(tool.tool.input.changes)) push(target)
    }
    if (tool.tool.name === 'CodexDiff') {
        for (const target of getDiffTargets(tool.tool.input)) push(target)
    }

    const command = getCommandText(tool.tool.input)
    if (command) {
        for (const target of getInspectionCommandTargets(command)) push(target)
    }
    return targets
}

function getToolFileTarget(tool: ToolCallBlock): string | null {
    return getToolFileTargets(tool)[0] ?? null
}

function getToolDisplayTargets(tool: ToolCallBlock): string[] {
    const intent = inferGroupedSummaryIntent(tool)
    if (intent === 'inspect-files' || intent === 'modify-files') {
        return getToolFileTargets(tool)
    }
    if (intent === 'search-content') {
        const directScope = safePathValue(getInputStringAny(tool.tool.input, ['path', 'file_path', 'directory']))
        if (directScope) return [directScope]
        const command = getCommandText(tool.tool.input)
        const scope = command ? getSearchCommandScope(command) : null
        return scope ? [scope] : []
    }
    if (intent === 'run-project-command') {
        const cwd = safePathValue(getInputStringAny(tool.tool.input, ['cwd', 'workdir', 'working_directory', 'workingDirectory']))
        return cwd ? [cwd] : []
    }
    if (intent === 'open-web') {
        const url = safeLabelValue(getInputStringAny(tool.tool.input, ['url']))
        if (!url) return []
        try {
            return [new URL(url).hostname]
        } catch {
            return [url]
        }
    }
    const fallback = safePathValue(getInputStringAny(tool.tool.input, ['path', 'file_path', 'directory']))
        ?? safeLabelValue(getInputStringAny(tool.tool.input, ['url']))
    return fallback ? [fallback] : []
}

function getToolDisplayTarget(tool: ToolCallBlock): string | null {
    return getToolDisplayTargets(tool)[0] ?? null
}

function truncatePathLabel(value: string, maxLength = 28): string {
    if (value.length <= maxLength) return value
    const normalized = value.replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    const tail = parts.slice(-2).join('/')
    const compact = !normalized.startsWith('/') && parts.length > 3
        ? `${parts[0]}/…/${tail}`
        : `…/${tail}`
    if (compact.length <= maxLength) return compact
    const file = parts.at(-1) ?? normalized
    const fileCompact = !normalized.startsWith('/') && parts.length > 2
        ? `${parts[0]}/…/${file}`
        : `…/${file}`
    if (fileCompact.length <= maxLength) return fileCompact
    if (tail.length + 2 <= maxLength) return `…/${tail}`
    return `…${normalized.slice(-(maxLength - 1))}`
}

function getGroupedDisplayTargets(block: ToolGroupBlock, metadata: SessionMetadataSummary | null): string[] {
    const targets: string[] = []
    const seen = new Set<string>()
    for (const tool of block.tools) {
        for (const rawTarget of getToolDisplayTargets(tool)) {
            const resolved = resolveDisplayPath(rawTarget, metadata)
            const display = truncatePathLabel(resolved === '<root>' || resolved === '.' ? '' : resolved)
            if (!display || seen.has(display)) continue
            seen.add(display)
            targets.push(display)
        }
    }
    return targets
}

function formatSpecificIntentTitle(block: ToolGroupBlock, intent: GroupedSummaryIntent, t: Translator): string | null {
    const matching = block.tools.filter((tool) => inferGroupedSummaryIntent(tool) === intent)
    const described = matching
        .flatMap((tool) => [tool.tool.nativeTitle, tool.tool.description])
        .map((value) => safeLabelValue(value ?? null))
        .filter((value): value is string => value !== null)
        .find((value) => !isGenericActivityTitle(value, t))
    if (described) return described

    if (intent === 'inspect-files' || intent === 'modify-files') {
        for (const tool of matching) {
            const target = getToolFileTarget(tool)
            if (target) {
                return t(intent === 'modify-files' ? 'toolGroup.friendly.editTarget' : 'toolGroup.friendly.inspectTarget', {
                    target: basename(target)
                })
            }
        }
    }

    if (intent === 'search-content') {
        for (const tool of matching) {
            const pattern = safeLabelValue(getInputStringAny(tool.tool.input, ['pattern', 'query']))
            if (pattern) return t('toolGroup.friendly.searchTarget', { target: pattern })
            const command = getCommandText(tool.tool.input)
            const commandPattern = command ? getSearchCommandPattern(command) : null
            if (commandPattern) return t('toolGroup.friendly.searchTarget', { target: commandPattern })
        }
    }

    if (intent === 'run-project-command') {
        for (const tool of matching) {
            const command = safeLabelValue(getCommandText(tool.tool.input))
            if (command && SAFE_PROJECT_COMMAND_RE.test(command)) {
                return t('toolGroup.friendly.runTarget', { target: command })
            }
        }
    }

    return null
}

function formatMixedMutationTitle(block: ToolGroupBlock, t: Translator): string | null {
    const intents = getIntentSet(block)
    if (!intents.has('modify-files') || intents.size < 2) return null
    const includesInspection = intents.has('inspect-files') || intents.has('search-content')

    const mutationTarget = block.tools
        .filter((tool) => inferGroupedSummaryIntent(tool) === 'modify-files')
        .map(getToolFileTarget)
        .find((value): value is string => value !== null)
    if (mutationTarget) {
        return t(includesInspection ? 'toolGroup.friendly.inspectAndEditTarget' : 'toolGroup.friendly.editTarget', {
            target: basename(mutationTarget)
        })
    }
    return t(includesInspection ? 'toolGroup.friendly.inspectAndEdit' : 'toolGroup.friendly.editFiles')
}

export function formatGroupedHeaderTitle(
    block: ToolGroupBlock,
    t: Translator,
    locale: Locale = 'en',
): string {
    const primaryIntent = getPrimaryIntent(block)
    const activityTitle = safeLabelValue(block.activityTitle ?? null)
    const mixedMutationTitle = formatMixedMutationTitle(block, t)
    if (mixedMutationTitle) return mixedMutationTitle
    const specificTitle = formatSpecificIntentTitle(block, primaryIntent, t)
    if (activityTitle && !isGenericActivityTitle(activityTitle, t)) {
        // Codex generates these headings independently from the model prompt,
        // so Chinese sessions can still receive English titles. Prefer the
        // concrete translated tool intent; use verb localization as fallback.
        if (isEnglishCodexActivityTitle(activityTitle, locale)) {
            return specificTitle ?? localizeCodexActivityTitle(activityTitle, locale)
        }
        return activityTitle
    }
    if (specificTitle) return specificTitle
    if (activityTitle) return localizeCodexActivityTitle(activityTitle, locale)
    if (primaryIntent === 'generic-tool') {
        return t('toolGroup.title')
    }
    return getIntentLabel(primaryIntent, t)
}

export type GroupedHeaderMeta = {
    location: string | null
    steps: string
}

export function getGroupedHeaderMeta(
    block: ToolGroupBlock,
    t: Translator,
    metadata: SessionMetadataSummary | null = null,
): GroupedHeaderMeta {
    const workspace = metadata?.path ? basename(metadata.path) : null
    const reversedTools = [...block.tools].reverse()
    const runningTool = reversedTools.find((tool) => tool.tool.state === 'running')
    const pendingTool = runningTool ? null : reversedTools.find((tool) => tool.tool.state === 'pending')
    const activeTool = runningTool ?? pendingTool
    const activeTarget = activeTool ? getToolDisplayTarget(activeTool) : null
    const targets = getGroupedDisplayTargets(block, metadata)

    let detail: string | null = null
    if (activeTarget) {
        const resolved = resolveDisplayPath(activeTarget, metadata)
        const display = resolved === '<root>' || resolved === '.' ? null : truncatePathLabel(resolved)
        if (display) {
            detail = t(runningTool ? 'toolGroup.meta.current' : 'toolGroup.meta.waiting', { target: display })
        }
    } else if (targets.length === 1) {
        detail = targets[0]
    } else if (targets.length > 1) {
        detail = t('toolGroup.meta.moreTargets', { target: targets[0], n: targets.length - 1 })
    }

    const location = workspace && detail
        ? `${workspace} › ${detail}`
        : workspace ?? detail
    const stepCount = block.needsOlderHistory ? `${block.tools.length}+` : block.tools.length
    const steps = t('toolGroup.meta.steps', { n: stepCount })
    return { location, steps }
}

export function formatGroupedHeaderSubtitle(
    block: ToolGroupBlock,
    t: Translator,
    metadata: SessionMetadataSummary | null = null,
): string {
    const meta = getGroupedHeaderMeta(block, t, metadata)
    return meta.location ? `${meta.location} · ${meta.steps}` : meta.steps
}

export function formatGroupedRowLabel(tool: ToolCallBlock, t: Translator): string {
    return getIntentLabel(inferGroupedSummaryIntent(tool), t)
}
