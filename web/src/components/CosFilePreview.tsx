import { ImageLightbox } from '@/components/ImageLightbox'

function getFileTypeFromUrl(url: string): 'image' | 'video' | 'pdf' | 'other' {
    const lower = url.toLowerCase()
    if (/\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?|$)/.test(lower)) return 'image'
    if (/\.(mp4|webm|mov)(\?|$)/.test(lower)) return 'video'
    if (/\.pdf(\?|$)/.test(lower)) return 'pdf'
    return 'other'
}

function getFilenameFromUrl(url: string): string {
    try {
        const path = new URL(url).pathname
        return path.split('/').pop() || 'file'
    } catch {
        return 'file'
    }
}

export function CosFilePreview({ url, forceImage = false }: { url: string; forceImage?: boolean }) {
    const type = forceImage ? 'image' : getFileTypeFromUrl(url)
    const filename = getFilenameFromUrl(url)

    if (type === 'image') {
        return (
            <div className="mt-2">
                <ImageLightbox src={url} alt={filename} downloadUrl={url} filename={filename} triggerClassName="inline-block max-w-full">
                    <div className="relative rounded-lg overflow-hidden border border-[var(--app-border)] bg-[var(--app-bg-secondary)] inline-block max-w-full">
                        <img
                            src={url}
                            alt={filename}
                            className="max-h-[400px] max-w-full object-contain cursor-pointer"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 text-xs text-white truncate">
                            {filename}
                        </div>
                    </div>
                </ImageLightbox>
            </div>
        )
    }

    if (type === 'video') {
        return (
            <div className="mt-2">
                <div className="rounded-lg overflow-hidden border border-[var(--app-border)] bg-[var(--app-bg-secondary)] inline-block max-w-full">
                    <video
                        src={url}
                        controls
                        className="max-h-[400px] max-w-full"
                        preload="metadata"
                    />
                    <div className="px-2 py-1 text-xs text-[var(--app-hint)] truncate">
                        {filename}
                    </div>
                </div>
            </div>
        )
    }

    if (type === 'pdf') {
        return (
            <div className="mt-2">
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] hover:bg-[var(--app-bg-tertiary)] transition-colors max-w-sm"
                >
                    <svg className="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M4 18h12a2 2 0 002-2V6l-4-4H6a2 2 0 00-2 2v12a2 2 0 002 2zm8-14l4 4h-4V4zM6 2h6v4h4v10H6V2z"/>
                    </svg>
                    <span className="text-sm text-[var(--app-fg)] truncate">{filename}</span>
                </a>
            </div>
        )
    }

    return (
        <div className="mt-2">
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg-secondary)] hover:bg-[var(--app-bg-tertiary)] transition-colors max-w-sm"
            >
                <svg className="w-5 h-5 text-[var(--app-hint)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span className="text-sm text-[var(--app-fg)] truncate">{filename}</span>
            </a>
        </div>
    )
}
