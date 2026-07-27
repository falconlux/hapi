import { describe, expect, it } from 'vitest'
import { getCodexReasoningSummary } from '@/lib/codexReasoningSummary'

describe('getCodexReasoningSummary', () => {
    it('extracts public summary text from the Codex result shape', () => {
        expect(getCodexReasoningSummary({
            content: '发现分组逻辑丢掉了正文。下一步保留并展示该字段。',
            status: 'completed'
        })).toBe('发现分组逻辑丢掉了正文。下一步保留并展示该字段。')
    })

    it('removes a repeated activity title while keeping the useful body', () => {
        expect(getCodexReasoningSummary(
            { output: { content: '**检查消息分组**\n正文在合并时被丢弃，因此需要写入分组模型。' } },
            '检查消息分组'
        )).toBe('正文在合并时被丢弃，因此需要写入分组模型。')
    })

    it('filters empty and title-only summaries', () => {
        expect(getCodexReasoningSummary({ content: '' }, '正在检查')).toBeNull()
        expect(getCodexReasoningSummary({ content: '**更新最终词汇映射**' }, '正在检查')).toBeNull()
        expect(getCodexReasoningSummary({ content: '正在检查。' }, '正在检查')).toBeNull()
    })

    it('converts useful markdown into a compact plain-text preview', () => {
        expect(getCodexReasoningSummary({
            content: '- **发现**：CLI 已请求详细摘要。\n- **判断**：问题在展示层。\n- **下一步**：补测试。'
        })).toBe('发现：CLI 已请求详细摘要。 判断：问题在展示层。 下一步：补测试。')
    })
})
