import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { type ReactNode, useState } from "react"

/**
 * Sleek hidden dropdown: the pill (or avatar) is the only visible control;
 * options live in a popover menu. Shares the `z-50` positioner pattern with
 * the filter and workspace menus so page content never paints over it.
 */
export function PropertyMenu({
  label,
  preview,
  triggerClassName,
  children,
}: {
  label: string
  preview: ReactNode
  triggerClassName?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={(props) => (
          <button
            type="button"
            {...props}
            aria-label={label}
            className={triggerClassName}
          >
            {preview}
          </button>
        )}
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            role="menu"
            className="z-50 w-52 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-1 text-popover-foreground shadow-xl outline-none"
          >
            {children(() => setOpen(false))}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export function PropertyMenuOption({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
        selected ? "font-medium" : ""
      }`}
    >
      {children}
    </button>
  )
}
