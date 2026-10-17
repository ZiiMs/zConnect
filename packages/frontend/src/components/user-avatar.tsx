import { cn } from "cn"
import { UserRound } from "lucide-react"
import { Tooltip } from "@/components/ui/tooltip"
import { type MemberRef, memberName } from "@/lib/api"

/** Up to two uppercase initials from a display name. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return parts
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const avatarClass =
  "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground"

/**
 * Round user avatar: the user's real image when present, otherwise their
 * initials. Purely presentational — the accessible name lives on the
 * surrounding control or its tooltip.
 */
export function UserAvatar({
  name,
  image,
  size = 20,
  className,
}: {
  name: string
  image?: string | null
  size?: number
  className?: string
}) {
  if (image) {
    return (
      <span
        className={cn(avatarClass, className)}
        style={{ height: size, width: size }}
      >
        <img src={image} alt="" className="size-full object-cover" />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(avatarClass, className)}
      style={{ height: size, width: size, fontSize: size * 0.42 }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Unassigned placeholder: dashed ring around a person glyph. */
export function UnassignedAvatar({
  size = 20,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full border border-muted-foreground border-dashed text-muted-foreground",
        className
      )}
      style={{ height: size, width: size }}
    >
      <UserRound aria-hidden="true" size={Math.round(size * 0.5)} />
    </span>
  )
}

/**
 * The assignee as an avatar with a hover tooltip naming them. Renders the
 * user's real avatar image when the roster knows it, their initials when it
 * only knows the name, and a person glyph when all we have is the id. A
 * null `userId` renders the dashed unassigned placeholder. Set `tooltip` to
 * false when the mark already sits inside a labelled control (a picker
 * trigger), so only one hover affordance opens.
 */
export function AssigneeAvatar({
  member,
  userId,
  size = 20,
  className,
  tooltip = true,
}: {
  member?: MemberRef
  userId: string | null
  size?: number
  className?: string
  tooltip?: boolean
}) {
  const mark =
    userId === null ? (
      <UnassignedAvatar size={size} />
    ) : member?.name !== undefined ? (
      <UserAvatar name={member.name} image={member.image} size={size} />
    ) : (
      <span className={avatarClass} style={{ height: size, width: size }}>
        <UserRound aria-hidden="true" size={Math.round(size * 0.5)} />
      </span>
    )
  const wrapper = (
    <span
      data-testid={
        userId === null ? "assignee-unassigned" : `assignee-${userId}`
      }
      className={cn("inline-grid shrink-0", className)}
    >
      {mark}
    </span>
  )
  if (!tooltip) return wrapper
  const label = userId === null ? "Unassigned" : memberName(member, userId)
  return <Tooltip content={label}>{wrapper}</Tooltip>
}
