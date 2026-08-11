import { useEffect, useState } from 'react'
import type { SessionGroup } from '@/types/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from '@/lib/use-translation'

export function MoveSessionGroupDialog(props: {
    isOpen: boolean
    groups: SessionGroup[]
    currentGroupId: string | null
    onClose: () => void
    onMove: (groupId: string | null) => Promise<void>
    isPending: boolean
}) {
    const { t } = useTranslation()
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(props.currentGroupId)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!props.isOpen) return
        setSelectedGroupId(props.currentGroupId)
        setError(null)
    }, [props.currentGroupId, props.isOpen])

    const handleMove = async () => {
        setError(null)
        try {
            await props.onMove(selectedGroupId)
            props.onClose()
        } catch {
            setError(t('session.group.moveError'))
        }
    }

    return (
        <Dialog open={props.isOpen} onOpenChange={(open) => !open && props.onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('session.group.moveTitle')}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('session.group.moveDescription')}
                    </DialogDescription>
                </DialogHeader>
                <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--app-subtle-bg)]">
                        <input
                            type="radio"
                            name="session-group"
                            checked={selectedGroupId === null}
                            onChange={() => setSelectedGroupId(null)}
                        />
                        <span>{t('session.group.ungrouped')}</span>
                    </label>
                    {props.groups.map((group) => (
                        <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-[var(--app-subtle-bg)]">
                            <input
                                type="radio"
                                name="session-group"
                                checked={selectedGroupId === group.id}
                                onChange={() => setSelectedGroupId(group.id)}
                            />
                            <span className="truncate">{group.name}</span>
                        </label>
                    ))}
                </div>
                {error ? <div role="alert" className="mt-3 text-sm text-red-500">{error}</div> : null}
                <div className="mt-4 flex justify-end gap-2">
                    <Button type="button" variant="secondary" onClick={props.onClose} disabled={props.isPending}>
                        {t('button.cancel')}
                    </Button>
                    <Button type="button" onClick={handleMove} disabled={props.isPending || selectedGroupId === props.currentGroupId}>
                        {props.isPending ? t('session.group.moving') : t('session.group.move')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
