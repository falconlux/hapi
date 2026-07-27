import { describe, expect, it } from 'vitest';
import {
    ReasoningProcessor,
    type ReasoningOutput,
    type ReasoningToolCall,
    type ReasoningToolResult
} from './reasoningProcessor';

function collectProcessor(): {
    processor: ReasoningProcessor;
    messages: ReasoningOutput[];
} {
    const messages: ReasoningOutput[] = [];
    return {
        processor: new ReasoningProcessor((message) => messages.push(message as ReasoningOutput)),
        messages
    };
}

function toolCalls(messages: ReasoningOutput[]): ReasoningToolCall[] {
    return messages.filter((message): message is ReasoningToolCall => message.type === 'tool-call');
}

function toolResults(messages: ReasoningOutput[]): ReasoningToolResult[] {
    return messages.filter((message): message is ReasoningToolResult => message.type === 'tool-call-result');
}

describe('ReasoningProcessor live progress', () => {
    it('publishes a visible card on the first public summary delta', () => {
        const { processor, messages } = collectProcessor();

        processor.processDelta('**');

        expect(toolCalls(messages)).toHaveLength(1);
        expect(toolCalls(messages)[0]).toMatchObject({
            name: 'CodexReasoning',
            input: { title: 'Analyzing next step' }
        });
        expect(toolResults(messages)).toHaveLength(0);
    });

    it('updates the same card with the public title and summary before completion', () => {
        const { processor, messages } = collectProcessor();

        processor.processDelta('**');
        processor.processDelta('Inspecting message flow');
        processor.processDelta('**\nThe CLI already receives public summaries, so the Web card should show them.');

        const callsBeforeCompletion = toolCalls(messages);
        expect(callsBeforeCompletion.length).toBeGreaterThanOrEqual(2);
        expect(new Set(callsBeforeCompletion.map((message) => message.callId)).size).toBe(1);
        expect(callsBeforeCompletion.at(-1)?.input).toEqual({
            title: 'Inspecting message flow',
            summary: 'The CLI already receives public summaries, so the Web card should show them.'
        });

        processor.complete(
            '**Inspecting message flow**\nThe CLI already receives public summaries, so the Web card should show them.'
        );

        expect(toolResults(messages)).toHaveLength(1);
        expect(toolResults(messages)[0].output).toEqual({
            content: 'The CLI already receives public summaries, so the Web card should show them.',
            status: 'completed'
        });
        expect(toolResults(messages)[0].callId).toBe(callsBeforeCompletion[0].callId);
    });

    it('streams untitled public summaries through one progress card', () => {
        const { processor, messages } = collectProcessor();
        const summary = 'Checking the persisted event shape before deciding the next safe change.';

        processor.processDelta(summary);
        processor.complete(summary);

        expect(toolCalls(messages)[0]).toMatchObject({
            input: {
                title: 'Analyzing next step',
                summary
            }
        });
        expect(toolResults(messages)[0]).toMatchObject({
            output: { content: summary, status: 'completed' }
        });
    });

    it('finishes an interrupted live card instead of leaving it running forever', () => {
        const { processor, messages } = collectProcessor();

        processor.processDelta('**Planning a safe deployment');
        processor.handleSectionBreak();

        expect(toolResults(messages)).toHaveLength(1);
        expect(toolResults(messages)[0].output.status).toBe('canceled');
    });
});
