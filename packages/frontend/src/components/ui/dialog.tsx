import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"
import type { ReactNode } from "react"

/**
 * Production modal sheet on the Base UI dialog primitive: focus-trapped,
 * Escape and backdrop close, labelled by `title`. Controlled via
 * `open`/`onOpenChange` so parents close it after successful submits.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[200] bg-black/60" />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-1/2 left-1/2 z-[201] max-h-[85svh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-auto border bg-card p-4 shadow-xl",
            className
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <DialogPrimitive.Title className="font-semibold text-base">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close dialog"
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <span aria-hidden="true">×</span>
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="mb-3 text-muted-foreground text-sm">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
