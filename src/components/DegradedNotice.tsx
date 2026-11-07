/** Shown when the shared (user-added) entries couldn't be loaded and only the built-in ones are available. */
export default function DegradedNotice() {
  return (
    <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      The shared word bank is temporarily unavailable, so you're seeing the built-in entries only. Entries added by others will return when the connection recovers.
    </p>
  )
}
