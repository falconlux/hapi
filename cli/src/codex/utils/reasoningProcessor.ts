/**
 * Reasoning Processor - Handles streaming reasoning deltas and identifies reasoning tools
 * 
 * This processor accumulates agent_reasoning_delta events and identifies when
 * reasoning sections start with **[Title]** format, treating them as tool calls.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';

export interface ReasoningToolCall {
    type: 'tool-call';
    name: 'CodexReasoning';
    callId: string;
    input: {
        title: string;
        summary?: string;
    };
    id: string;
}

export interface ReasoningToolResult {
    type: 'tool-call-result';
    callId: string;
    output: {
        content?: string;
        status?: 'completed' | 'canceled';
    };
    id: string;
}

export interface ReasoningMessage {
    type: 'reasoning';
    message: string;
    id: string;
}

export type ReasoningOutput = ReasoningToolCall | ReasoningToolResult | ReasoningMessage;

const LIVE_REASONING_FALLBACK_TITLE = 'Analyzing next step';
const LIVE_REASONING_PREVIEW_LIMIT = 600;
const LIVE_REASONING_UPDATE_MIN_DELTA = 48;

export class ReasoningProcessor {
    private accumulator: string = '';
    private inTitleCapture: boolean = false;
    private titleBuffer: string = '';
    private contentBuffer: string = '';
    private hasTitle: boolean = false;
    private currentCallId: string | null = null;
    private toolCallStarted: boolean = false;
    private currentTitle: string | null = null;
    private lastPublishedSnapshot: string = '';
    private onMessage: ((message: any) => void) | null = null;

    constructor(onMessage?: (message: any) => void) {
        this.onMessage = onMessage || null;
        this.reset();
    }

    /**
     * Set the message callback for sending messages directly
     */
    setMessageCallback(callback: (message: any) => void): void {
        this.onMessage = callback;
    }

    /**
     * Process a reasoning section break - indicates a new reasoning section is starting
     */
    handleSectionBreak(): void {
        this.finishCurrentToolCall('canceled');
        this.resetState();
        logger.debug('[ReasoningProcessor] Section break - reset state');
    }

    /**
     * Process a reasoning delta and accumulate content
     */
    processDelta(delta: string): void {
        this.accumulator += delta;

        // If we haven't started processing yet, check if this starts with **
        if (!this.inTitleCapture && !this.hasTitle && !this.contentBuffer) {
            if (this.accumulator.startsWith('**')) {
                // Start title capture
                this.inTitleCapture = true;
                this.titleBuffer = this.accumulator.substring(2); // Remove leading **
                logger.debug('[ReasoningProcessor] Started title capture');
            } else if (this.accumulator.length > 0) {
                // This is untitled reasoning, just accumulate as content
                this.contentBuffer = this.accumulator;
            }
        } else if (this.inTitleCapture) {
            // We're capturing the title
            this.titleBuffer = this.accumulator.substring(2); // Keep updating from start
            
            // Check if we've found the closing **
            const titleEndIndex = this.titleBuffer.indexOf('**');
            if (titleEndIndex !== -1) {
                // Found the end of title
                const title = this.titleBuffer.substring(0, titleEndIndex);
                const afterTitle = this.titleBuffer.substring(titleEndIndex + 2);
                
                this.hasTitle = true;
                this.inTitleCapture = false;
                this.currentTitle = title;
                this.contentBuffer = afterTitle;
                
                // Generate a call ID for this reasoning section
                this.currentCallId = this.currentCallId || randomUUID();
                
                logger.debug(`[ReasoningProcessor] Title captured: "${title}"`);
                
                // Replace the provisional live heading as soon as the real
                // public summary title is available.
                this.publishLiveProgress(true);
            }
        } else if (this.hasTitle) {
            // We have a title, accumulate content after title
            this.contentBuffer = this.accumulator.substring(
                this.accumulator.indexOf('**') + 2 + 
                this.currentTitle!.length + 2
            );
        } else {
            // Untitled reasoning, just accumulate
            this.contentBuffer = this.accumulator;
        }

        // App-server summary deltas are already the provider's public
        // reasoning summary (not hidden chain-of-thought). Publish a live card
        // on the first delta so remote users do not stare at an empty screen,
        // then update it in coarse chunks to avoid one Hub message per token.
        this.publishLiveProgress(false);
    }

    /**
     * Return a compact public preview suitable for a live progress card.
     */
    private getLiveSummary(): string {
        const source = this.hasTitle
            ? this.contentBuffer
            : this.inTitleCapture
                ? ''
                : this.contentBuffer;
        const compact = source.replace(/\s+/g, ' ').trim();
        if (compact.length <= LIVE_REASONING_PREVIEW_LIMIT) return compact;
        return `${compact.slice(0, LIVE_REASONING_PREVIEW_LIMIT - 1)}…`;
    }

    /**
     * Return the best currently known activity heading.
     */
    private getLiveTitle(): string {
        const title = this.currentTitle?.trim()
            || (this.inTitleCapture ? this.titleBuffer.split('**', 1)[0]?.trim() : '');
        if (!title) return LIVE_REASONING_FALLBACK_TITLE;
        return title.replace(/\s+/g, ' ').slice(0, 160);
    }

    /**
     * Start or update the single live reasoning card for this summary part.
     */
    private publishLiveProgress(force: boolean): void {
        this.currentCallId = this.currentCallId || randomUUID();

        const title = this.getLiveTitle();
        const summary = this.getLiveSummary();
        const snapshot = `${title}\u0000${summary}`;
        if (snapshot === this.lastPublishedSnapshot) return;
        if (
            this.toolCallStarted
            && !force
            && snapshot.length - this.lastPublishedSnapshot.length < LIVE_REASONING_UPDATE_MIN_DELTA
        ) {
            return;
        }

        const toolCall: ReasoningToolCall = {
            type: 'tool-call',
            name: 'CodexReasoning',
            callId: this.currentCallId,
            input: {
                title,
                ...(summary ? { summary } : {})
            },
            id: randomUUID()
        };

        logger.debug(
            this.toolCallStarted
                ? `[ReasoningProcessor] Updating live reasoning: "${title}"`
                : `[ReasoningProcessor] Sending tool call start for: "${title}"`
        );
        this.onMessage?.(toolCall);
        this.toolCallStarted = true;
        this.lastPublishedSnapshot = snapshot;
    }

    /**
     * Complete the reasoning section with final text
     */
    complete(fullText: string): void {
        // Extract title and content if present
        let title: string | undefined;
        let content: string = fullText;
        
        if (fullText.startsWith('**')) {
            const titleEndIndex = fullText.indexOf('**', 2);
            if (titleEndIndex !== -1) {
                title = fullText.substring(2, titleEndIndex);
                content = fullText.substring(titleEndIndex + 2).trim();
            }
        }

        logger.debug(`[ReasoningProcessor] Complete reasoning - Title: "${title}", Has content: ${content.length > 0}`);
        
        if (title) {
            this.currentTitle = title;
            this.hasTitle = true;
            this.inTitleCapture = false;
            this.contentBuffer = content;
        } else if (this.toolCallStarted) {
            this.currentTitle = null;
            this.hasTitle = false;
            this.inTitleCapture = false;
            this.contentBuffer = content;
        }

        // Flush the final public heading/body before completing the card.
        if (this.toolCallStarted || title) {
            this.publishLiveProgress(true);
        }

        if (this.toolCallStarted && this.currentCallId) {
            // Send tool call result for titled reasoning
            const toolResult: ReasoningToolResult = {
                type: 'tool-call-result',
                callId: this.currentCallId,
                output: {
                    content: content,
                    status: 'completed'
                },
                id: randomUUID()
            };
            logger.debug('[ReasoningProcessor] Sending tool call result');
            this.onMessage?.(toolResult);
        } else {
            // Send regular reasoning message for untitled reasoning
            const reasoningMessage: ReasoningMessage = {
                type: 'reasoning',
                message: content,
                id: randomUUID()
            };
            logger.debug('[ReasoningProcessor] Sending reasoning message');
            this.onMessage?.(reasoningMessage);
        }
        
        // Reset state after completion
        this.resetState();
    }

    /**
     * Abort the current reasoning section
     */
    abort(): void {
        logger.debug('[ReasoningProcessor] Abort called');
        this.finishCurrentToolCall('canceled');
        this.resetState();
    }

    /**
     * Reset the processor state
     */
    reset(): void {
        this.finishCurrentToolCall('canceled');
        this.resetState();
    }

    /**
     * Finish current tool call if one is in progress
     */
    private finishCurrentToolCall(status: 'completed' | 'canceled'): void {
        if (this.toolCallStarted && this.currentCallId) {
            this.publishLiveProgress(true);
            // Send tool call result with canceled status
            const toolResult: ReasoningToolResult = {
                type: 'tool-call-result',
                callId: this.currentCallId,
                output: {
                    content: this.contentBuffer || '',
                    status: status
                },
                id: randomUUID()
            };
            logger.debug(`[ReasoningProcessor] Sending tool call result with status: ${status}`);
            this.onMessage?.(toolResult);
        }
    }

    /**
     * Reset internal state
     */
    private resetState(): void {
        this.accumulator = '';
        this.inTitleCapture = false;
        this.titleBuffer = '';
        this.contentBuffer = '';
        this.hasTitle = false;
        this.currentCallId = null;
        this.toolCallStarted = false;
        this.currentTitle = null;
        this.lastPublishedSnapshot = '';
    }

    /**
     * Get the current call ID for tool result matching
     */
    getCurrentCallId(): string | null {
        return this.currentCallId;
    }

    /**
     * Check if a tool call has been started
     */
    hasStartedToolCall(): boolean {
        return this.toolCallStarted;
    }
}
