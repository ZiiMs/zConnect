import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import type { ReactElement, ReactNode } from "react"

/**
 * Hover/focus tooltip on the Base UI primitive. The caller supplies the
 * trigger element, which Base UI clones with the tooltip's event handlers —
 * pass a real DOM element (a `span`, a chip), not a component that drops
 * props, so the handlers and ref land where the pointer is.
 */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode
  children: ReactElement
  side?: "top" | "bottom" | "left" | "right"
}) {
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger render={children} />
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner
            side={side}
            sideOffset={6}
            className="z-50"
          >
            <TooltipPrimitive.Popup className="max-w-64 rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md">
              {content}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
