import { useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { CATEGORY_COLORS, nextCategoryColor } from '@renderer/lib/categories'
import { useApp } from '@renderer/stores/app'
import { useUi } from '@renderer/stores/ui'
import { attempt } from '../tasks/actions'

export function CategoryDialog(): React.JSX.Element {
  const target = useUi((state) => state.categoryDialog)
  const close = (): void => useUi.getState().set({ categoryDialog: null })

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-sm">
        {/* A fresh form each time it opens, starting from the category being edited. */}
        {target && <CategoryForm key={target.id ?? 'new'} id={target.id} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}

function CategoryForm({ id, onDone }: { id?: string; onDone: () => void }): React.JSX.Element {
  const categories = useApp((state) => state.categories)
  const editing = id ? categories.find((category) => category.id === id) : undefined
  const [name, setName] = useState(editing?.name ?? '')
  const [color, setColor] = useState(() => editing?.color ?? nextCategoryColor(categories))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = async (): Promise<void> => {
    const saved = editing
      ? await attempt(() =>
          window.api.categories.update({ id: editing.id, patch: { name, color } })
        )
      : await attempt(() => window.api.categories.create({ name, color }))
    if (saved) onDone()
  }

  const remove = async (): Promise<void> => {
    if (!editing) return
    await attempt(() => window.api.categories.remove(editing.id))
    const view = useUi.getState().view
    if (view.kind === 'category' && view.id === editing.id)
      useUi.getState().setView({ kind: 'today' })
    onDone()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit category' : 'New category'}</DialogTitle>
        <DialogDescription>
          Categories color-code your tasks in lists and the calendar.
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
            value={name}
            autoFocus
            maxLength={60}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label id="category-color">Color</Label>
          <div role="radiogroup" aria-labelledby="category-color" className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === color}
                aria-label={option}
                onClick={() => setColor(option)}
                className="ring-offset-background focus-visible:ring-ring grid size-7 place-items-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ background: option }}
              >
                {option === color && <Check className="size-4" />}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          {editing ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Its tasks stay, uncategorised.</span>
                <Button type="button" variant="destructive" size="sm" onClick={() => void remove()}>
                  Delete
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                Delete category
              </Button>
            )
          ) : (
            <span />
          )}
          <Button type="submit" disabled={!name.trim()}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}
