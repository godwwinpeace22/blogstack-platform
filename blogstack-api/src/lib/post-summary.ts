export function postSummary(html: string | null) {
  const text = (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:amp|lt|gt|quot|#039|nbsp);/g,
      (value) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#039;": "'",
          "&nbsp;": " ",
        })[value] ?? value,
    )
    .replace(/\s+/g, " ")
    .trim();
  const src = /<img\b[^>]*\bsrc="([^"]+)"/i.exec(html ?? "")?.[1] ?? null;
  return {
    excerpt: text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text,
    coverImage: src,
    readingMinutes: Math.max(
      1,
      Math.ceil(text.split(/\s+/).filter(Boolean).length / 200),
    ),
  };
}
