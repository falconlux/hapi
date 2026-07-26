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
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain("reasoning summaries in the user's language");
        expect(ADAPTIVE_REASONING_INSTRUCTION).toContain('never expose hidden chain-of-thought');
    });

    it('combines title and adaptive-reasoning instructions for every Codex session', () => {
        expect(codexSystemPrompt).toBe(`${TITLE_INSTRUCTION}\n\n${ADAPTIVE_REASONING_INSTRUCTION}`);
    });
});
