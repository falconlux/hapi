/**
 * Codex-specific system prompt for local mode.
 *
 * This prompt instructs Codex to call the hapi__change_title function
 * to set appropriate chat session titles.
 */

import { trimIdent } from '@/utils/trimIdent';
import { buildSessionCitationSteerInstruction } from '@hapi/protocol/sessionCitation';
import { DISPLAY_IMAGE_PROMPT_CODEX, DISPLAY_MEDIA_PROMPT_CODEX, DISPLAY_VIDEO_PROMPT_CODEX } from '@/modules/common/displayImagePrompt';
import { withSessionSummaryInstruction } from '@/modules/common/sessionSummaryInstruction';

/**
 * Title instruction for Codex to call the hapi MCP tool.
 * Note: Codex exposes MCP tools under the `functions.` namespace,
 * so the tool is called as `functions.hapi__change_title`.
 */
export const TITLE_INSTRUCTION = trimIdent(`
    Use the title tool sparingly. For a new chat, call it once after the user's initial request is clear, and set a concise task title.
    Prefer calling functions.hapi__change_title.
    If that exact tool name is unavailable, call an equivalent alias such as hapi__change_title, mcp__hapi__change_title, or hapi_change_title.
    Do not rename the chat for routine progress, substeps, implementation details, or a slightly better wording.
    Rename only when the user's primary objective changes substantially and the existing title would be misleading.
    ${DISPLAY_IMAGE_PROMPT_CODEX}
    ${DISPLAY_VIDEO_PROMPT_CODEX}
    ${DISPLAY_MEDIA_PROMPT_CODEX}
    ${buildSessionCitationSteerInstruction({
        inspectTool: 'functions.hapi__inspect_peer',
        pingTool: 'functions.hapi__ping_peer',
        listPeersTool: 'functions.hapi__list_peers',
    })}
`);

/**
 * Keep routine work fast while still allowing thorough analysis when the task
 * genuinely needs it. This guides behavior independently of the model's
 * configured reasoning-effort setting.
 */
export const ADAPTIVE_REASONING_INSTRUCTION = trimIdent(`
    Match the depth of reasoning to the task's actual complexity.
    For simple, local, or routine requests, act directly with minimal analysis. Do not create a plan, broadly explore the repository, or delegate work unless it materially helps. Use the fewest tool calls needed to complete the task safely.
    Reserve deep or exhaustive reasoning for genuinely complex work, including ambiguous multi-step problems, architecture or design tradeoffs, difficult debugging, security-sensitive or destructive changes, migrations, and requests that explicitly ask for thorough analysis.
    Start with the lightest adequate approach. Escalate to deeper analysis only when evidence reveals hidden complexity, the first straightforward attempt fails, or the risk of a wrong answer is high.
    Keep user-facing explanations proportional to the task and report conclusions rather than private chain-of-thought.
`);

/**
 * The system prompt to inject via developer_instructions in local mode.
 * Session-summary contract is resolved at call time (hub toggle / env).
 */
const BASE_CODEX_SYSTEM_PROMPT = `${TITLE_INSTRUCTION}\n\n${ADAPTIVE_REASONING_INSTRUCTION}`

export function getCodexSystemPrompt(env: NodeJS.ProcessEnv = process.env): string {
    return withSessionSummaryInstruction(BASE_CODEX_SYSTEM_PROMPT, env)
}

/** Alias kept for existing call sites / tests that expect a string constant name. */
export const codexSystemPrompt = BASE_CODEX_SYSTEM_PROMPT
