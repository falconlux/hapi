import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'

export function SessionGroupNameDialog(props: {
    isOpen: boolean
    title: string
    initialName?: string
    onClose: () => void
    onSubmit: (name: string) => Promise<void>
    isPending: boolean
}) {
    const { t } = useTranslation()
    const [name, setName] = useState(props.initialName ?? '')
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!props.isOpen) return
        setName(props.initialName ?? '')
        setError(null)
        const frame = window.requestAnimationFrame(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        })
        return () => window.cancelAnimationFrame(frame)
    }, [props.initialName, props.isOpen])

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return
        setError(null)
        try {
            await props.onSubmit(trimmed)
            props.onClose()
        } catch {
            setError(t('session.group.saveError'))
        }
    }

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{props.title}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('session.group.nameDescription')}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t('session.group.namePlaceholder')}
                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2.5 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--app-button)]"
                        disabled={props.isPending}
                        maxLength={80}
                    />
                    {error ? <div role="alert" className="text-sm text-red-500">{error}</div> : null}
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={props.onClose} disabled={props.isPending}>
                            {t('button.cancel')}
                        </Button>
                        <Button type="submit" disabled={props.isPending || !name.trim()}>
                            {props.isPending ? t('dialog.rename.saving') : t('button.save')}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}
