import type { ChatBlock, ToolCallBlock } from '@/chat/types'
import { extractTodoChecklist, extractUpdatePlanChecklist, type ChecklistItem } from '@/components/ToolCard/checklist'
import { getInputStringAny } from '@/lib/toolInputUtils'

export type AgentProgressSnapshot = {
    objective: string | null
    progressMessage: string | null
    phase: string | null
    runningTool: ToolCallBlock | null
    completedPhases: number
    completedActions: number
    planCompleted: number | null
    planTotal: number | null
}

const META_TOOL_NAMES = new Set([
    'CodexReasoning',
    'CodexPermission',
    'TodoWrite',
    'update_plan',
])

function normalizeProgressText(value: string | null | undefined): string | null {
    if (!value) return null
    const normalized = value
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/(?:^|\s)[#>*_`~-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return normalized || null
}

function getPlanItems(block: ToolCallBlock): ChecklistItem[] {
    if (block.tool.name === 'update_plan') {
        return extractUpdatePlanChecklist(block.tool.input, block.tool.result)
    }
    if (block.tool.name === 'TodoWrite') {
        return extractTodoChecklist(block.tool.input, block.tool.result)
    }
    return []
}

function findRunningTool(blocks: readonly ChatBlock[]): ToolCallBlock | null {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        const block = blocks[index]
        if (block.kind !== 'tool-call') continue

        const runningChild = findRunningTool(block.children)
        if (runningChild) return runningChild

        if (
            !META_TOOL_NAMES.has(block.tool.name)
            && (block.tool.state === 'running' || block.tool.state === 'pending')
        ) {
            return block
        }
    }
    return null
}

export function deriveAgentProgress(
    blocks: readonly ChatBlock[],
    fallbackObjective?: string | null,
): AgentProgressSnapshot {
    let lastUserIndex = -1
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
        if (blocks[index].kind === 'user-text') {
            lastUserIndex = index
            break
        }
    }

    const lastUserBlock = lastUserIndex >= 0 ? blocks[lastUserIndex] : undefined
    const userObjective = lastUserBlock?.kind === 'user-text'
        ? normalizeProgressText(lastUserBlock.text)
        : null
    const objective = userObjective ?? normalizeProgressText(fallbackObjective)
    const turnBlocks = blocks.slice(lastUserIndex + 1)

    let progressMessage: string | null = null
    let phase: string | null = null
    let completedPhases = 0
    let completedActions = 0
    let latestPlan: ChecklistItem[] = []

    for (const block of turnBlocks) {
        if (block.kind === 'agent-text') {
            progressMessage = normalizeProgressText(block.text) ?? progressMessage
            continue
        }
        if (block.kind !== 'tool-call') continue

        if (block.tool.name === 'CodexReasoning') {
            phase = normalizeProgressText(getInputStringAny(block.tool.input, ['title'])) ?? phase
            if (block.tool.state === 'completed') completedPhases += 1
            continue
        }

        const plan = getPlanItems(block)
        if (plan.length > 0) {
            latestPlan = plan
        }

        if (!META_TOOL_NAMES.has(block.tool.name) && block.tool.state === 'completed') {
            completedActions += 1
        }
    }

    const currentPlanStep = latestPlan.find((item) => item.status === 'in_progress')
    if (currentPlanStep) {
        phase = normalizeProgressText(currentPlanStep.text) ?? phase
    }

    return {
        objective,
        progressMessage,
        phase,
        runningTool: findRunningTool(turnBlocks),
        completedPhases,
        completedActions,
        planCompleted: latestPlan.length > 0
            ? latestPlan.filter((item) => item.status === 'completed').length
            : null,
        planTotal: latestPlan.length > 0 ? latestPlan.length : null,
    }
}
