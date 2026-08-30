/** Minimal classname joiner - avoids pulling in a dependency (clsx/tailwind-merge) for what every
 * usage in this app only needs: joining a fixed base string with a few conditional extras. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
