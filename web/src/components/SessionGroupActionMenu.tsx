import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties
} from 'react'
import { useTranslation } from '@/lib/use-translation'

type MenuPosition = {
    top: number
    left: number
    transformOrigin: string
}

export function SessionGroupActionMenu(props: {
    isOpen: boolean
    anchorPoint: { x: number; y: number }
    onClose: () => void
    onRename: () => void
    onDelete?: () => void
    heading?: string
    renameLabel?: string
}) {
    const { t } = useTranslation()
    const menuRef = useRef<HTMLDivElement | null>(null)
    const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
    const headingId = `session-group-action-menu-${useId()}-heading`

    const updatePosition = useCallback(() => {
        const menu = menuRef.current
        if (!menu) return

        const rect = menu.getBoundingClientRect()
        const padding = 8
        const gap = 8
        const spaceBelow = window.innerHeight - props.anchorPoint.y
        const spaceAbove = props.anchorPoint.y
        const openAbove = spaceBelow < rect.height + gap && spaceAbove > spaceBelow
        const maxTop = Math.max(padding, window.innerHeight - rect.height - padding)
        const maxLeft = Math.max(padding, window.innerWidth - rect.width - padding)

        const preferredTop = openAbove
            ? props.anchorPoint.y - rect.height - gap
            : props.anchorPoint.y + gap
        const preferredLeft = props.anchorPoint.x - rect.width / 2

        setMenuPosition({
            top: Math.min(Math.max(preferredTop, padding), maxTop),
            left: Math.min(Math.max(preferredLeft, padding), maxLeft),
            transformOrigin: openAbove ? 'bottom center' : 'top center'
        })
    }, [props.anchorPoint])

    useLayoutEffect(() => {
        if (!props.isOpen) return
        updatePosition()
    }, [props.isOpen, updatePosition])

    useEffect(() => {
        if (!props.isOpen) {
            setMenuPosition(null)
            return
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current?.contains(event.target as Node)) return
            props.onClose()
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') props.onClose()
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        window.addEventListener('resize', updatePosition)
        window.addEventListener('scroll', updatePosition, true)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('resize', updatePosition)
            window.removeEventListener('scroll', updatePosition, true)
        }
    }, [props.isOpen, props.onClose, updatePosition])

    useEffect(() => {
        if (!props.isOpen) return
        const frame = window.requestAnimationFrame(() => {
            menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
        })
        return () => window.cancelAnimationFrame(frame)
    }, [props.isOpen])

    if (!props.isOpen) return null

    const style: CSSProperties = menuPosition
        ? {
            top: `max(${menuPosition.top}px, calc(env(safe-area-inset-top) + 8px))`,
            left: menuPosition.left,
            transformOrigin: menuPosition.transformOrigin
        }
        : { visibility: 'hidden' }
    const itemClassName = 'w-full rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-[180px] rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-1 shadow-lg animate-menu-pop"
            style={style}
        >
            <div id={headingId} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-hint)]">
                {props.heading ?? t('session.group.actions')}
            </div>
            <div role="menu" aria-labelledby={headingId} className="flex flex-col gap-1">
                <button
                    type="button"
                    role="menuitem"
                    className={`${itemClassName} hover:bg-[var(--app-subtle-bg)]`}
                    onClick={() => {
                        props.onClose()
                        props.onRename()
                    }}
                >
                    {props.renameLabel ?? t('session.group.rename')}
                </button>
                {props.onDelete ? <button
                    type="button"
                    role="menuitem"
                    className={`${itemClassName} text-red-500 hover:bg-red-500/10`}
                    onClick={() => {
                        props.onClose()
                        props.onDelete?.()
                    }}
                >
                    {t('session.group.delete')}
                </button> : null}
            </div>
        </div>
    )
}
