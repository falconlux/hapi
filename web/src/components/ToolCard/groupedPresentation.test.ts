import { describe, expect, it } from 'vitest'
import { en, zhCN } from '@/lib/locales'
import type { ToolCallBlock } from '@/chat/types'
import type { ToolGroupBlock } from '@/chat/toolGroups'
import { formatGroupedHeaderSubtitle, formatGroupedHeaderTitle, formatGroupedRowLabel, inferGroupedSummaryIntent } from '@/components/ToolCard/groupedPresentation'

type Dict = Record<string, string>

function makeTranslator(dict: Dict) {
    return (key: string, params?: Record<string, string | number>) => {
        const template = dict[key] ?? key
        if (!params) return template
        return template.replace(/\{(\w+)\}/g, (match, token) => {
            const value = params[token]
            return value === undefined ? match : String(value)
        })
    }
}

function makeTool(id: string, name: string, input: unknown = {}): ToolCallBlock {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        invokedAt: null,
        tool: {
            id,
            name,
            state: 'completed',
            input,
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            execStartedAt: null,
            execCompletedAt: null,
            description: null,
            result: null,
            permission: undefined,
        },
        children: [],
    }
}

function makeGroup(tools: ToolCallBlock[]): ToolGroupBlock {
    const read = tools.filter((tool) => tool.tool.name === 'Read').length
    const search = tools.filter((tool) => tool.tool.name === 'Grep' || tool.tool.name === 'Glob').length
    const command = tools.filter((tool) => tool.tool.name === 'Bash' || tool.tool.name === 'CodexBash' || tool.tool.name === 'shell_command' || tool.tool.name === 'run_shell_command').length
    const mutation = tools.filter((tool) => tool.tool.name === 'Edit' || tool.tool.name === 'Write' || tool.tool.name === 'MultiEdit').length
    const web = tools.filter((tool) => tool.tool.name === 'WebFetch' || tool.tool.name === 'WebSearch').length

    return {
        kind: 'tool-group',
        id: 'tool-group:test',
        createdAt: 1,
        invokedAt: null,
        firstToolId: tools[0].id,
        lastToolId: tools[tools.length - 1].id,
        tools,
        defaultOpen: false,
        historyState: 'complete',
        needsOlderHistory: false,
        summary: {
            totalTools: tools.length,
            countsByKind: {
                read,
                search,
                command,
                mutation,
                web,
                other: tools.length - read - search - command - mutation - web,
            },
            fileTargets: [],
            commandTargets: [],
            searchTargets: [],
            urlTargets: [],
            otherTargets: [],
            errorCount: 0,
            runningCount: 0,
            pendingCount: 0,
        },
    }
}

const tEn = makeTranslator(en as Dict)
const tZh = makeTranslator(zhCN as Dict)

describe('inferGroupedSummaryIntent', () => {
    it('treats run_shell_command as a command intent', () => {
        expect(inferGroupedSummaryIntent(makeTool('shell-1', 'run_shell_command', { command: 'bun test' }))).toBe('run-project-command')
    })

    it('treats file inspection shell commands as inspect-files intent', () => {
        const tool = makeTool('shell-1', 'shell_command', { command: 'Get-ChildItem src -Recurse' })
        expect(inferGroupedSummaryIntent(tool)).toBe('inspect-files')
    })

    it('treats content search shell commands as search-content intent', () => {
        const tool = makeTool('shell-2', 'Bash', { command: 'rg "TodoWrite" web/src' })
        expect(inferGroupedSummaryIntent(tool)).toBe('search-content')
    })

    it('supports ACP native kinds, run_shell_command, and command-shaped legacy tools', () => {
        const nativeEdit = makeTool('native-edit', 'replace_file', { path: 'src/a.ts' })
        nativeEdit.tool.nativeKind = 'edit'

        expect(inferGroupedSummaryIntent(nativeEdit)).toBe('modify-files')
        expect(inferGroupedSummaryIntent(makeTool('gemini-shell', 'run_shell_command', { command: 'cat README.md' })))
            .toBe('inspect-files')
        expect(inferGroupedSummaryIntent(makeTool('legacy-acp', 'ls -la /repo', { command: 'ls -la /repo' })))
            .toBe('inspect-files')
    })

    it('requires a real shell executable instead of matching command arguments', () => {
        expect(inferGroupedSummaryIntent(makeTool('echo-search', 'shell_command', { command: 'echo rg authToken' })))
            .toBe('run-project-command')
    })
})

describe('formatGroupedRowLabel', () => {
    it('returns a friendly english label without leaking raw shell command text', () => {
        const tool = makeTool('shell-3', 'shell_command', { command: 'Get-ChildItem src -Recurse' })
        const label = formatGroupedRowLabel(tool, tEn)

        expect(label).toBe('Inspect project files')
        expect(label).not.toContain('Get-ChildItem')
        expect(label).not.toContain('src')
    })

    it('returns a friendly chinese label for command execution', () => {
        const tool = makeTool('shell-4', 'Bash', { command: 'bun run build:web' })
        expect(formatGroupedRowLabel(tool, tZh)).toBe('执行项目命令')
    })
})

describe('formatGroupedHeaderTitle', () => {
    it('uses an immediately preceding Codex activity heading', () => {
        const group = makeGroup([
            makeTool('read-activity-1', 'Read', { file_path: 'auth.ts' }),
            makeTool('read-activity-2', 'Read', { file_path: 'session.ts' }),
        ])
        group.activityTitle = 'Inspecting the authentication flow'

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Inspecting the authentication flow')
    })

    it('replaces a generic Codex activity heading with a concrete target', () => {
        const group = makeGroup([
            makeTool('read-generic-activity-1', 'shell_command', {
                command: "printf 'files' && sed -n '1,120p' web/src/auth.ts | head -80",
            }),
            makeTool('read-generic-activity-2', 'shell_command', { command: 'cat web/src/session.ts' }),
        ])
        group.activityTitle = '检查项目文件'

        expect(formatGroupedHeaderTitle(group, tZh)).toBe('检查 auth.ts')
    })

    it('uses a specific file target instead of the generic inspection label', () => {
        const group = makeGroup([
            makeTool('read-1', 'Read', { file_path: '/repo/src/auth.ts' }),
            makeTool('read-2', 'Read', { file_path: '/repo/src/session.ts' }),
        ])

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Inspect auth.ts')
    })

    it('uses a specific search pattern', () => {
        const group = makeGroup([
            makeTool('grep-1', 'Grep', { pattern: 'authToken' }),
            makeTool('grep-2', 'Grep', { pattern: 'authToken' }),
        ])

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Search “authToken”')
    })

    it('extracts safe targets from Codex inspection and search commands', () => {
        const inspect = makeGroup([
            makeTool('inspect-command-1', 'shell_command', { command: "sed -n '1,120p' web/src/auth.ts" }),
            makeTool('inspect-command-2', 'shell_command', { command: 'cat web/src/session.ts' }),
        ])
        const search = makeGroup([
            makeTool('search-command-1', 'shell_command', { command: "rg 'authToken' web/src" }),
            makeTool('search-command-2', 'shell_command', { command: "grep 'authToken' cli/src/index.ts" }),
        ])

        expect(formatGroupedHeaderTitle(inspect, tEn)).toBe('Inspect auth.ts')
        expect(formatGroupedHeaderTitle(search, tEn)).toBe('Search “authToken”')
    })

    it('skips search option values and redacts common token prefixes', () => {
        const optioned = makeGroup([
            makeTool('search-option-1', 'shell_command', { command: "rg -g '*.ts' authToken web/src" }),
            makeTool('search-option-2', 'shell_command', { command: "grep -m 2 authToken cli/src" }),
        ])
        const credential = makeGroup([
            makeTool('search-secret-1', 'Grep', { pattern: 'ghp_1234567890abcdefghijklmnop' }),
            makeTool('search-secret-2', 'Grep', { pattern: 'ghp_1234567890abcdefghijklmnop' }),
        ])

        expect(formatGroupedHeaderTitle(optioned, tEn)).toBe('Search “authToken”')
        expect(formatGroupedHeaderTitle(credential, tEn)).toBe('Search project content')
        expect(formatGroupedHeaderTitle(credential, tEn)).not.toContain('ghp_')
    })

    it('uses a safe project command but hides arbitrary command text', () => {
        const safe = makeGroup([
            makeTool('cmd-1', 'Bash', { command: 'bun test' }),
            makeTool('cmd-2', 'Bash', { command: 'bun test' }),
        ])
        const sensitive = makeGroup([
            makeTool('cmd-3', 'Bash', { command: 'curl -H "Authorization: Bearer abc" example.com' }),
            makeTool('cmd-4', 'Bash', { command: 'curl example.com' }),
        ])

        expect(formatGroupedHeaderTitle(safe, tEn)).toBe('Run bun test')
        expect(formatGroupedHeaderTitle(sensitive, tEn)).toBe('Run project commands')
        expect(formatGroupedHeaderTitle(sensitive, tEn)).not.toContain('Bearer')
    })

    it('prefers a Claude call description and truncates long labels', () => {
        const first = makeTool('cmd-description-1', 'Bash', { command: 'node script.js' })
        first.tool.description = 'Check the authentication migration behavior before applying changes'
        const second = makeTool('cmd-description-2', 'Bash', { command: 'node other.js' })
        const group = makeGroup([first, second])

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Check the authentication migration behavior before applying changes')
    })

    it('prefers a useful provider-native title', () => {
        const first = makeTool('native-title-1', 'Bash', { command: 'node script.js' })
        first.tool.nativeTitle = 'Validate authentication migration'
        const group = makeGroup([
            first,
            makeTool('native-title-2', 'Bash', { command: 'node other.js' }),
        ])

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Validate authentication migration')
    })

    it('does not hide a file mutation behind a read-heavy group title', () => {
        const group = makeGroup([
            makeTool('read-before-edit-1', 'Read', { file_path: '/repo/src/auth.ts' }),
            makeTool('read-before-edit-2', 'Read', { file_path: '/repo/src/session.ts' }),
            makeTool('edit-after-read', 'Edit', { file_path: '/repo/src/auth.ts' }),
        ])
        group.activityTitle = 'Inspecting the authentication flow'

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Inspect and edit auth.ts')
    })

    it('describes a mixed edit and test group as an edit, not an inspection', () => {
        const group = makeGroup([
            makeTool('test-before-edit', 'Bash', { command: 'bun test' }),
            makeTool('edit-after-test', 'Edit', { file_path: '/repo/src/auth.ts' }),
        ])

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Edit auth.ts')
    })

    it('extracts file targets from Codex patch and diff payloads', () => {
        const patch = makeGroup([
            makeTool('patch-1', 'CodexPatch', { changes: { '/repo/src/auth.ts': {}, '/repo/src/session.ts': {} } }),
            makeTool('patch-2', 'CodexPatch', { changes: { '/repo/src/auth.ts': {} } }),
        ])
        const diff = makeGroup([
            makeTool('diff-1', 'CodexDiff', { unified_diff: '--- a/src/api.ts\n+++ b/src/api.ts\n@@ -1 +1 @@' }),
            makeTool('diff-2', 'CodexDiff', { unified_diff: '--- a/src/ui.ts\n+++ b/src/ui.ts\n@@ -1 +1 @@' }),
        ])

        expect(formatGroupedHeaderTitle(patch, tEn)).toBe('Edit auth.ts')
        expect(formatGroupedHeaderSubtitle(patch, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo › src/auth.ts +1 · 2 steps')
        expect(formatGroupedHeaderTitle(diff, tEn)).toBe('Edit api.ts')
        expect(formatGroupedHeaderSubtitle(diff, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo › src/api.ts +1 · 2 steps')
    })

    it('uses the primary activity without an inline +n suffix', () => {
        const group = makeGroup([
            makeTool('shell-1', 'shell_command', { command: 'Get-ChildItem src -Recurse' }),
            makeTool('shell-2', 'shell_command', { command: 'Get-Content package.json' }),
            makeTool('shell-3', 'shell_command', { command: 'dir web' }),
            makeTool('shell-4', 'shell_command', { command: 'ls docs' }),
            makeTool('shell-5', 'shell_command', { command: 'cat README.md' }),
        ])

        expect(formatGroupedHeaderTitle(group, tZh)).toBe('检查 src')
    })

    it('uses a neutral title for all-generic tool groups', () => {
        const group = makeGroup([
            makeTool('tool-1', 'Tool', { name: 'Tool 1' }),
            makeTool('tool-2', 'Tool', { name: 'Tool 2' }),
        ])

        expect(formatGroupedHeaderTitle(group, tEn)).toBe('Tool activity')
    })
})

describe('formatGroupedHeaderSubtitle', () => {
    it('shows workspace, concrete targets, and one step count', () => {
        const group = makeGroup([
            makeTool('shell-1', 'shell_command', { command: "cat /repo/README.md && sed -n '1,80p' /repo/web/src/App.tsx" }),
            makeTool('shell-2', 'shell_command', { command: 'cat /repo/package.json' }),
        ])

        const metadata = { path: '/repo', host: 'local' }
        expect(formatGroupedHeaderSubtitle(group, tEn, metadata)).toBe('repo › README.md +2 · 2 steps')
        expect(formatGroupedHeaderSubtitle(group, tZh, metadata)).toBe('repo › README.md +2 · 2 步')
    })

    it('falls back to workspace and steps for all-generic tool groups', () => {
        const group = makeGroup([
            makeTool('tool-1', 'Tool', { name: 'Tool 1' }),
            makeTool('tool-2', 'Tool', { name: 'Tool 2' }),
        ])

        expect(formatGroupedHeaderSubtitle(group, tEn, { path: '/repo', host: 'local' })).toBe('repo · 2 steps')
    })

    it('shows the current target while a grouped action is running', () => {
        const running = makeTool('running-1', 'Read', { file_path: '/repo/web/src/ToolGroupCard.tsx' })
        running.tool.state = 'running'
        const group = makeGroup([
            makeTool('done-1', 'Read', { file_path: '/repo/README.md' }),
            running,
        ])

        expect(formatGroupedHeaderSubtitle(group, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo › Current: web/src/ToolGroupCard.tsx · 2 steps')
    })

    it('prefers a running target over a later pending target and labels pending-only work as waiting', () => {
        const running = makeTool('running-first', 'Read', { file_path: '/repo/src/running.ts' })
        running.tool.state = 'running'
        const pending = makeTool('pending-last', 'Read', { file_path: '/repo/src/pending.ts' })
        pending.tool.state = 'pending'
        const runningGroup = makeGroup([running, pending])
        const pendingGroup = makeGroup([
            makeTool('done-before-pending', 'Read', { file_path: '/repo/src/done.ts' }),
            pending,
        ])

        expect(formatGroupedHeaderSubtitle(runningGroup, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo › Current: src/running.ts · 2 steps')
        expect(formatGroupedHeaderSubtitle(pendingGroup, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo › Waiting: src/pending.ts · 2 steps')
    })

    it('keeps long absolute project paths while hiding token-like path segments', () => {
        const projectRoot = '/Users/luxiang/workspace/hapi'
        const running = makeTool('long-path-running', 'Edit', {
            file_path: `${projectRoot}/web/src/components/ToolCard/ToolGroupCard.tsx`,
        })
        running.tool.state = 'running'
        const longPathGroup = makeGroup([
            makeTool('long-path-read', 'Read', { file_path: `${projectRoot}/README.md` }),
            running,
        ])
        const secretPathGroup = makeGroup([
            makeTool('secret-path-1', 'Read', { file_path: '/repo/tmp/ghp_1234567890abcdefghijklmnop' }),
            makeTool('secret-path-2', 'Read', { file_path: '/repo/tmp/ghp_1234567890abcdefghijklmnop' }),
        ])

        expect(formatGroupedHeaderTitle(longPathGroup, tEn)).toBe('Inspect and edit ToolGroupCard.tsx')
        expect(formatGroupedHeaderSubtitle(longPathGroup, tEn, { path: projectRoot, host: 'local' }))
            .toBe('hapi › Current: web/…/ToolGroupCard.tsx · 2 steps')
        expect(formatGroupedHeaderTitle(secretPathGroup, tEn)).toBe('Inspect project files')
        expect(formatGroupedHeaderSubtitle(secretPathGroup, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo · 2 steps')
    })

    it('turns the opaque 34-operation chinese summary into concrete work', () => {
        const tools = Array.from({ length: 34 }, (_, index) => makeTool(
            `inspect-${index + 1}`,
            'shell_command',
            { command: `cat /repo/web/src/file-${index + 1}.ts` },
        ))
        const group = makeGroup(tools)
        group.activityTitle = '检查项目文件'

        const title = formatGroupedHeaderTitle(group, tZh)
        const subtitle = formatGroupedHeaderSubtitle(group, tZh, { path: '/repo', host: 'local' })

        expect(title).toBe('检查 file-1.ts')
        expect(subtitle).toBe('repo › web/src/file-1.ts +33 · 34 步')
        expect(`${title} / ${subtitle}`).not.toContain('执行 34')
        expect(`${title} / ${subtitle}`).not.toContain('34 次操作')
    })

    it('marks a partial history count with a plus suffix', () => {
        const group = makeGroup([
            makeTool('partial-1', 'Read', { file_path: '/repo/src/a.ts' }),
            makeTool('partial-2', 'Read', { file_path: '/repo/src/b.ts' }),
        ])
        group.needsOlderHistory = true
        group.historyState = 'needs-older-history'

        expect(formatGroupedHeaderSubtitle(group, tEn, { path: '/repo', host: 'local' }))
            .toBe('repo › src/a.ts +1 · 2+ steps')
    })
})
