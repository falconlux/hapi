import { describe, expect, it } from 'vitest';
import {
    ADAPTIVE_REASONING_INSTRUCTION,
    TITLE_INSTRUCTION,
    codexSystemPrompt
} from './systemPrompt';

describe('Codex system prompt', () => {
    it('keeps routine work lightweight and reserves deep reasoning for complex tasks', () => {
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('simple, local, or routine requests');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('act directly with minimal analysis');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('Reserve deep or exhaustive reasoning for genuinely complex work');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('Escalate to deeper analysis only when evidence reveals hidden complexity');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain("reasoning-summary titles in the language of the user's latest message");
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('never expose hidden chain-of-thought');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('more than 20 seconds or 3 tool calls');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('after at most 5 tool calls or 60 seconds');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('maintain a concise 3-6 step plan with update_plan');
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('Do not fall back to English when the user is writing in Chinese');
    });

    it('combines title and adaptive-reasoning instructions for every Codex session', () => {
        expect(codexSystemPrompt).toBe(`${TITLE_INSTRUCTION}\n\n${ADAPTIVE_REASONING_INSTRUCTION}`);
    });
});
