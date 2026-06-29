import { DEFAULT_GLM_MODEL } from '@hapi/protocol'

export { DEFAULT_GLM_MODEL }

export const GLM_API_BASE_DEFAULT = 'https://newapi.1to10.cn/v1'
export const GLM_API_TOKEN_DEFAULT = '83c47083a72927011e8a8a7abc7022ed745183caea3a9ac3'

export const GLM_API_BASE_ENV = 'GLM_API_BASE'
export const GLM_API_TOKEN_ENV = 'GLM_API_TOKEN'
export const GLM_MODEL_ENV = 'GLM_MODEL'

export type GlmRuntimeConfig = {
    apiBase: string
    token: string
    model: string
}

export function resolveGlmConfig(opts: { model?: string } = {}): GlmRuntimeConfig {
    return {
        apiBase: process.env[GLM_API_BASE_ENV] ?? GLM_API_BASE_DEFAULT,
        token: process.env[GLM_API_TOKEN_ENV] ?? GLM_API_TOKEN_DEFAULT,
        model: opts.model ?? process.env[GLM_MODEL_ENV] ?? DEFAULT_GLM_MODEL,
    }
}
