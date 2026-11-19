/**
 * Converts a string to a URL-safe slug.
 * "Hello World! (2024)" → "hello-world-2024"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9\s-]/g, "") // keep alphanum, spaces, hyphens
    .trim()
    .replace(/[\s]+/g, "-") // spaces → hyphens
    .replace(/-{2,}/g, "-") // collapse multiple hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * Appends a numeric suffix if the base slug already exists in the set.
 * slugifyUnique("hello", new Set(["hello", "hello-1"])) → "hello-2"
 */
export function slugifyUnique(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let n = 1;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
