export const ENTITY_NAME_MAX_LENGTH = 9;

export function normalizeEntityName(name: string): string {
  return name.trim();
}

export function normalizeEntityNameKey(name: string): string {
  return normalizeEntityName(name).toLowerCase();
}

export function findDuplicateEntityNameKeys(names: ReadonlyArray<string>): Set<string> {
  const counts = new Map<string, number>();

  for (const name of names) {
    const key = normalizeEntityNameKey(name);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) {
      duplicates.add(key);
    }
  }

  return duplicates;
}
