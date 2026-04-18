import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getTelegramWebApp, isTelegramEnvironment } from './useTelegram'
import type { AuthSource } from './useAuth'

const ACCESS_TOKEN_PREFIX = 'hapi_access_token::'
const ACCESS_PASSWORD_PREFIX = 'hapi_access_password::'

function getTelegramInitData(): string | null {
    const tg = getTelegramWebApp()
    if (tg?.initData) {
        return tg.initData
    }

    // Fallback: check URL parameters (for testing or alternative flows)
    const query = new URLSearchParams(window.location.search)
    const tgWebAppData = query.get('tgWebAppData')
    if (tgWebAppData) {
        return tgWebAppData
    }

    const initData = query.get('initData')
    return initData || null
}

function getTokenFromUrlParams(): string | null {
    if (typeof window === 'undefined') return null
    const query = new URLSearchParams(window.location.search)
    return query.get('token')
}

function getAccessTokenKey(baseUrl: string): string {
    return `${ACCESS_TOKEN_PREFIX}${baseUrl}`
}

function getAccessPasswordKey(baseUrl: string): string {
    return `${ACCESS_PASSWORD_PREFIX}${baseUrl}`
}

function readLS(key: string): string | null {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function writeLS(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Ignore
    }
}

function removeLS(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Ignore
    }
}

function getStoredAccessToken(key: string): string | null {
    return readLS(key)
}

function storeAccessToken(key: string, token: string): void {
    writeLS(key, token)
}

function clearStoredAccessToken(key: string): void {
    removeLS(key)
}

export function useAuthSource(baseUrl: string): {
    authSource: AuthSource | null
    isLoading: boolean
    isTelegram: boolean
    setAccessToken: (token: string, password?: string) => void
    updatePassword: (password: string) => void
    clearAuth: () => void
} {
    const [authSource, setAuthSource] = useState<AuthSource | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isTelegram, setIsTelegram] = useState(false)
    const retryCountRef = useRef(0)
    const accessTokenKey = useMemo(() => getAccessTokenKey(baseUrl), [baseUrl])
    const accessPasswordKey = useMemo(() => getAccessPasswordKey(baseUrl), [baseUrl])

    // Initialize auth source on mount, with retry for delayed Telegram initData
    useEffect(() => {
        retryCountRef.current = 0
        setAuthSource(null)
        setIsTelegram(false)
        setIsLoading(true)

        const telegramInitData = getTelegramInitData()

        if (telegramInitData) {
            // Telegram Mini App environment
            setAuthSource({ type: 'telegram', initData: telegramInitData })
            setIsTelegram(true)
            setIsLoading(false)
            return
        }

        // Check for URL token parameter (for direct access links)
        const urlToken = getTokenFromUrlParams()
        if (urlToken) {
            storeAccessToken(accessTokenKey, urlToken) // Save to localStorage for refresh
            setAuthSource({ type: 'accessToken', token: urlToken })
            setIsLoading(false)
            return
        }

        // Check for stored access token as fallback
        const storedToken = getStoredAccessToken(accessTokenKey)
        const storedPassword = readLS(accessPasswordKey) ?? undefined
        if (storedToken) {
            setAuthSource({ type: 'accessToken', token: storedToken, password: storedPassword })
            setIsLoading(false)
            return
        }

        // Check if we're in a Telegram environment before polling
        if (!isTelegramEnvironment()) {
            // Plain browser - show login prompt immediately
            setIsLoading(false)
            return
        }

        // Telegram environment detected - poll for delayed initData
        // Telegram WebApp SDK may initialize slightly after page mount
        const maxRetries = 20
        const retryInterval = 250 // ms

        const interval = setInterval(() => {
            retryCountRef.current += 1
            const initData = getTelegramInitData()

            if (initData) {
                setAuthSource({ type: 'telegram', initData })
                setIsTelegram(true)
                setIsLoading(false)
                clearInterval(interval)
            } else if (retryCountRef.current >= maxRetries) {
                // Give up - show login prompt for browser access
                setIsLoading(false)
                clearInterval(interval)
            }
        }, retryInterval)

        return () => {
            clearInterval(interval)
        }
    }, [accessTokenKey])

    const setAccessToken = useCallback((token: string, password?: string) => {
        storeAccessToken(accessTokenKey, token)
        if (password) {
            writeLS(accessPasswordKey, password)
        } else {
            removeLS(accessPasswordKey)
        }
        setAuthSource({ type: 'accessToken', token, password })
    }, [accessTokenKey, accessPasswordKey])

    const updatePassword = useCallback((password: string) => {
        writeLS(accessPasswordKey, password)
        setAuthSource((prev) => {
            if (!prev || prev.type !== 'accessToken') return prev
            return { ...prev, password }
        })
    }, [accessPasswordKey])

    const clearAuth = useCallback(() => {
        clearStoredAccessToken(accessTokenKey)
        removeLS(accessPasswordKey)
        setAuthSource(null)
    }, [accessTokenKey, accessPasswordKey])

    return {
        authSource,
        isLoading,
        isTelegram,
        setAccessToken,
        updatePassword,
        clearAuth
    }
}
