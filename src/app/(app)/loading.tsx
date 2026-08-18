/**
 * Отклик на переход между разделами. Без него клик по полосе разделов выглядит
 * как несработавший, и оператор жмёт второй раз.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6" role="status" aria-label="Раздел загружается">
      <div className="h-6 w-40 animate-pulse rounded bg-panel-muted" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-panel-muted" />

      <div className="mt-9 h-px bg-line" />

      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-baseline justify-between gap-4 border-b border-line py-4">
          <div
            className="h-4 animate-pulse rounded bg-panel-muted"
            style={{ width: `${9 - row}rem` }}
          />
          <div className="h-4 w-10 animate-pulse rounded bg-panel-muted" />
        </div>
      ))}
    </div>
  );
}
