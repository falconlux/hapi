import { describe, expect, it } from 'vitest'
import { localizeCodexActivityTitle } from './codexActivityTitle'

describe('localizeCodexActivityTitle', () => {
    it('localizes action verbs and common engineering details', () => {
        expect(localizeCodexActivityTitle('Planning canvas mouse event dispatch', 'zh-CN'))
            .toBe('正在规划：画布鼠标事件分发')
        expect(localizeCodexActivityTitle('Debugging grid child indexing', 'zh-CN'))
            .toBe('正在排查：网格子项索引')
        expect(localizeCodexActivityTitle('Executing browser verification and type checks', 'zh-CN'))
            .toBe('正在执行：浏览器验收和类型检查')
        expect(localizeCodexActivityTitle('Building production bundle', 'zh-CN'))
            .toBe('正在构建：生产环境资源包')
        expect(localizeCodexActivityTitle('Mapping infrastructure translation terms', 'zh-CN'))
            .toBe('正在整理：基础设施翻译词汇')
        expect(localizeCodexActivityTitle('正在检查：current session state', 'zh-CN'))
            .toBe('正在检查：当前会话状态')
    })

    it('keeps commands, code paths, existing Chinese and English locale titles intact', () => {
        expect(localizeCodexActivityTitle('正在发布游戏', 'zh-CN')).toBe('正在发布游戏')
        expect(localizeCodexActivityTitle('Inspecting web/src/AgentProgressCard.tsx', 'zh-CN'))
            .toBe('正在检查：web/src/AgentProgressCard.tsx')
        expect(localizeCodexActivityTitle('Running bun run build:web', 'zh-CN'))
            .toBe('正在执行：bun run build:web')
        expect(localizeCodexActivityTitle('Planning release', 'en')).toBe('Planning release')
    })
})
