export function diffById<T extends { id: string }>(
  prev: T[],
  next: T[],
): { upserted: T[]; removed: T[] } {
  const before = new Map(prev.map((row) => [row.id, row]));
  const nextIds = new Set(next.map((row) => row.id));
  return {
    upserted: next.filter((row) => before.get(row.id) !== row),
    removed: prev.filter((row) => !nextIds.has(row.id)),
  };
}
