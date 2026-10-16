/**
 * Auto key ("slug") for a project name: the first four URL-safe characters,
 * uppercased, always starting with a letter so it satisfies the key schema
 * (`^[A-Z][A-Z0-9]{1,15}$`). Short or letterless names yield a short or
 * empty string — the form leaves those for the user to complete.
 */
export function slugifyProjectKey(name: string): string {
  const chars = name.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const firstLetter = chars.search(/[A-Z]/)
  if (firstLetter === -1) return ""
  return (chars[firstLetter] + chars.slice(firstLetter + 1)).slice(0, 4)
}
