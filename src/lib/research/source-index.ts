export function buildSourceIndex<T>(
  sources: T[],
  keyFn: (source: T) => string,
): Map<string, number> {
  const index = new Map<string, number>();
  sources.forEach((source, position) => {
    const key = keyFn(source);
    if (!key || index.has(key)) return;
    index.set(key, position + 1);
  });
  return index;
}

export function sourceMarkerNumbers(
  keys: string[],
  index: Map<string, number>,
): number[] {
  const numbers: number[] = [];
  for (const key of keys) {
    const number = index.get(key);
    if (number !== undefined && !numbers.includes(number)) {
      numbers.push(number);
    }
  }
  return numbers.sort((a, b) => a - b);
}

export function formatSourceMarkerLabel(numbers: number[]): string | null {
  if (numbers.length === 0) return null;
  return `[${numbers.join(",")}]`;
}
