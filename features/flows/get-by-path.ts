/**
 * Reads a value out of a parsed JSON structure using a small path syntax:
 *   $.data.id      data.id      data.items[0].id      items[2]
 * The leading `$` (and `$.`) is optional. Returns `undefined` on any miss,
 * so callers can treat a failed extraction as "variable not set".
 */
export function getByPath(root: unknown, path: string): unknown {
  const tokens = tokenizePath(path);
  if (!tokens.length) return undefined;

  let current: unknown = root;
  for (const token of tokens) {
    if (current == null) return undefined;
    if (typeof token === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[token];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[token];
    }
  }
  return current;
}

function tokenizePath(path: string): (string | number)[] {
  let normalized = path.trim();
  if (normalized.startsWith("$")) normalized = normalized.slice(1);
  if (normalized.startsWith(".")) normalized = normalized.slice(1);
  if (!normalized) return [];

  const tokens: (string | number)[] = [];
  for (const segment of normalized.split(".")) {
    if (!segment) continue;
    // Split a segment like `items[0][1]` into `items`, 0, 1.
    const match = segment.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!match) {
      tokens.push(segment);
      continue;
    }
    const [, key, indexes] = match;
    if (key) tokens.push(key);
    for (const index of indexes.matchAll(/\[(\d+)\]/g)) {
      tokens.push(Number(index[1]));
    }
  }
  return tokens;
}
