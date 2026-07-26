import type { Locale } from '@/lib/i18n-context'

const ACTIVITY_PREFIXES_ZH: Array<[RegExp, string]> = [
    [/^(?:Check|Checking|Inspect|Inspecting|Review|Reviewing|Read|Reading|Explore|Exploring|Locate|Locating|Find|Finding)\s+/i, '正在检查：'],
    [/^(?:Diagnose|Diagnosing|Debug|Debugging|Investigate|Investigating|Trace|Tracing|Troubleshoot|Troubleshooting)\s+/i, '正在排查：'],
    [/^(?:Plan|Planning|Design|Designing|Outline|Outlining|Prepare|Preparing)\s+/i, '正在规划：'],
    [/^(?:Test|Testing|Verify|Verifying|Validate|Validating|Confirm|Confirming)\s+/i, '正在验证：'],
    [/^(?:Implement|Implementing|Add|Adding|Create|Creating|Build|Building)\s+/i, '正在实现：'],
    [/^(?:Update|Updating|Change|Changing|Adjust|Adjusting|Refactor|Refactoring|Simplify|Simplifying|Edit|Editing|Modify|Modifying)\s+/i, '正在修改：'],
    [/^(?:Fix|Fixing|Resolve|Resolving|Repair|Repairing)\s+/i, '正在修复：'],
    [/^(?:Run|Running|Execute|Executing|Invoke|Invoking|Call|Calling)\s+/i, '正在执行：'],
    [/^(?:Capture|Capturing|Take|Taking|Collect|Collecting|Gather|Gathering)\s+/i, '正在获取：'],
    [/^(?:Select|Selecting|Choose|Choosing)\s+/i, '正在选择：'],
    [/^(?:Wait|Waiting|Poll|Polling|Monitor|Monitoring)\s+/i, '正在等待：'],
    [/^(?:Parse|Parsing|Analyze|Analyzing|Evaluate|Evaluating|Compare|Comparing|Assess|Assessing|Infer|Inferring)\s+/i, '正在分析：'],
    [/^(?:Summarize|Summarizing|Report|Reporting|Explain|Explaining|Document|Documenting)\s+/i, '正在总结：'],
    [/^(?:Deploy|Deploying|Publish|Publishing|Release|Releasing|Upload|Uploading|Sync|Syncing)\s+/i, '正在发布：'],
    [/^(?:Close|Closing|Open|Opening|Claim|Claiming|Handle|Handling|Process|Processing|Mark|Marking|Complete|Completing|Finish|Finishing|Finalize|Finalizing|Restore|Restoring|Resume|Resuming|Restart|Restarting|Start|Starting|Stop|Stopping)\s+/i, '正在处理：'],
]

export function localizeCodexActivityTitle(value: string, locale: Locale): string {
    if (locale !== 'zh-CN' || /[\u3400-\u9fff]/.test(value)) return value
    for (const [pattern, prefix] of ACTIVITY_PREFIXES_ZH) {
        if (pattern.test(value)) {
            return `${prefix}${value.replace(pattern, '')}`
        }
    }
    return `正在处理：${value}`
}

export function isEnglishCodexActivityTitle(value: string, locale: Locale): boolean {
    return locale === 'zh-CN' && !/[\u3400-\u9fff]/.test(value)
}
