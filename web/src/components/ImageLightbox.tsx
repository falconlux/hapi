import { type KeyboardEvent, type ReactNode, type TouchEvent, type WheelEvent, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'

type ImageLightboxProps = {
    src: string
    alt: string
    downloadUrl?: string
    filename?: string
    triggerClassName?: string
    children: ReactNode
}
type Transform = { scale: number; tx: number; ty: number }
type Point = { x: number; y: number }
const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_MS = 300
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function ImageLightbox(props: ImageLightboxProps) {
    const { src, alt, downloadUrl, filename, triggerClassName, children } = props
    const [isOpen, setIsOpen] = useState(false)
    const [isVisible, setIsVisible] = useState(false)
    const [scale, setScale] = useState(MIN_SCALE)
    const [tx, setTx] = useState(0)
    const [ty, setTy] = useState(0)
    const closeTimeoutRef = useRef<number | undefined>(undefined)
    const imageRef = useRef<HTMLImageElement>(null)
    const transformRef = useRef<Transform>({ scale: MIN_SCALE, tx: 0, ty: 0 })
    const pinchRef = useRef<{ distance: number; transform: Transform } | null>(null)
    const panRef = useRef<{ point: Point; transform: Transform } | null>(null)
    const lastTapRef = useRef(0)
    const applyTransform = (next: Transform) => {
        const clampedScale = clamp(next.scale, MIN_SCALE, MAX_SCALE)
        const image = imageRef.current
        const maxTx = image ? Math.max(0, (image.clientWidth * clampedScale - window.innerWidth) / 2) : 0
        const maxTy = image ? Math.max(0, (image.clientHeight * clampedScale - window.innerHeight) / 2) : 0
        const clamped = {
            scale: clampedScale,
            tx: clampedScale === MIN_SCALE ? 0 : clamp(next.tx, -maxTx, maxTx),
            ty: clampedScale === MIN_SCALE ? 0 : clamp(next.ty, -maxTy, maxTy),
        }
        transformRef.current = clamped
        setScale(clamped.scale)
        setTx(clamped.tx)
        setTy(clamped.ty)
    }
    const stopGesture = (event: TouchEvent<HTMLImageElement> | WheelEvent<HTMLImageElement>) => {
        event.preventDefault()
        event.stopPropagation()
    }
    const midpoint = (touches: TouchList): Point => ({
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
    })
    const distance = (touches: TouchList) => Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
    )
    const zoomAt = (point: Point, nextScale: number, origin = transformRef.current) => {
        const ratio = clamp(nextScale, MIN_SCALE, MAX_SCALE) / origin.scale
        applyTransform({
            scale: origin.scale * ratio,
            tx: origin.tx + (point.x - window.innerWidth / 2 - origin.tx) * (1 - ratio),
            ty: origin.ty + (point.y - window.innerHeight / 2 - origin.ty) * (1 - ratio),
        })
    }
    const open = () => {
        window.clearTimeout(closeTimeoutRef.current)
        setIsOpen(true)
    }

    const close = () => {
        setIsVisible(false)
        window.clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = window.setTimeout(() => {
            setIsOpen(false)
        }, 200)
    }
    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
    }
    useEffect(() => {
        return () => window.clearTimeout(closeTimeoutRef.current)
    }, [])

    useEffect(() => {
        if (!isOpen) return
        applyTransform({ scale: MIN_SCALE, tx: 0, ty: 0 })
        pinchRef.current = null
        panRef.current = null
        lastTapRef.current = 0
        const animationFrame = window.requestAnimationFrame(() => {
            setIsVisible(true)
        })
        return () => window.cancelAnimationFrame(animationFrame)
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const previousOverflow = document.body.style.overflow
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') close()
        }
        document.body.style.overflow = 'hidden'
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [isOpen])
    const handleTouchStart = (event: TouchEvent<HTMLImageElement>) => {
        stopGesture(event)
        if (event.touches.length === 2) {
            pinchRef.current = { distance: distance(event.touches), transform: transformRef.current }
            panRef.current = null
            return
        }
        if (event.touches.length !== 1) return

        const now = Date.now()
        const point = { x: event.touches[0].clientX, y: event.touches[0].clientY }
        if (now - lastTapRef.current < DOUBLE_TAP_MS) {
            zoomAt(point, transformRef.current.scale === MIN_SCALE ? 2 : MIN_SCALE)
            lastTapRef.current = 0
            return
        }
        lastTapRef.current = now
        panRef.current = transformRef.current.scale > MIN_SCALE ? { point, transform: transformRef.current } : null
    }
    const handleTouchMove = (event: TouchEvent<HTMLImageElement>) => {
        stopGesture(event)
        if (event.touches.length === 2 && pinchRef.current) {
            const start = pinchRef.current
            const currentMidpoint = midpoint(event.touches)
            const currentDistance = distance(event.touches)
            zoomAt(currentMidpoint, start.transform.scale * (currentDistance / start.distance), start.transform)
            return
        }
        if (event.touches.length === 1 && panRef.current) {
            const point = { x: event.touches[0].clientX, y: event.touches[0].clientY }
            applyTransform({
                scale: panRef.current.transform.scale,
                tx: panRef.current.transform.tx + point.x - panRef.current.point.x,
                ty: panRef.current.transform.ty + point.y - panRef.current.point.y,
            })
        }
    }
    const handleTouchEnd = (event: TouchEvent<HTMLImageElement>) => {
        stopGesture(event)
        if (event.touches.length < 2) pinchRef.current = null
        if (event.touches.length === 0) panRef.current = null
    }
    const handleWheel = (event: WheelEvent<HTMLImageElement>) => {
        stopGesture(event)
        const speed = event.ctrlKey ? 0.003 : 0.01
        zoomAt({ x: event.clientX, y: event.clientY }, transformRef.current.scale * Math.exp(-event.deltaY * speed))
    }

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                className={triggerClassName}
                onClick={open}
                onKeyDown={handleTriggerKeyDown}
            >
                {children}
            </div>
            {isOpen && ReactDOM.createPortal(
                <div
                    data-component="ImageLightbox"
                    className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 transition-opacity duration-200 ease-out ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                        paddingTop: 'max(1rem, env(safe-area-inset-top))',
                        paddingRight: 'max(1rem, env(safe-area-inset-right))',
                        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
                        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
                    }}
                    onClick={close}
                >
                    <button
                        type="button"
                        aria-label="Close image preview"
                        className="absolute right-4 top-4 z-[1001] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white shadow-lg backdrop-blur transition-colors hover:bg-black/70 active:bg-black/80"
                        style={{
                            top: 'max(1rem, env(safe-area-inset-top))',
                            right: 'max(1rem, env(safe-area-inset-right))',
                        }}
                        onClick={(event) => {
                            event.stopPropagation()
                            close()
                        }}
                    >
                        ×
                    </button>
                    <img
                        ref={imageRef}
                        src={src}
                        alt={alt}
                        className="max-h-[100vh] max-w-[100vw] object-contain shadow-2xl"
                        style={{
                            touchAction: 'none',
                            transform: `translate(${tx}px,${ty}px) scale(${scale})`,
                            transformOrigin: 'center',
                        }}
                        onClick={(event) => event.stopPropagation()}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchEnd}
                        onWheel={handleWheel}
                    />
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download={filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute bottom-4 left-4 z-[1001] rounded-full bg-black/50 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-black/70 active:bg-black/80"
                            style={{
                                bottom: 'max(1rem, env(safe-area-inset-bottom))',
                                left: 'max(1rem, env(safe-area-inset-left))',
                            }}
                            onClick={(event) => event.stopPropagation()}
                        >
                            Download
                        </a>
                    )}
                </div>,
                document.body,
            )}
        </>
    )
}
