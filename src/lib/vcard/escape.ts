// Escaping per RFC6350 (vCard 4.0):
// - Backslash -> \\
// - Comma -> \,
// - Semicolon -> \;
// - Newline (CR or LF) -> \n
function normalizeVCardText(input: string): string {
  return input
    .replace(
      new RegExp(
        `,?(?:${[
          "\\u00e2\\u20ac\\u2122",
          "\\u00e2\\u20ac\\u02dc",
          "\\u00e2\\u20ac\\u00b2",
          "\\u00c4\\u00f4",
          "\\u00c2\\u00b4",
          "`",
        ].join("|")})`,
        "g"
      ),
      "'"
    )
    .replace(
      new RegExp(
        `(?:${[
          "\\u00e2\\u20ac\\u0153",
          "\\u00e2\\u20ac\\u009d",
          "\\u00c4\\u00fa",
          "\\u00c4\\u00f9",
        ].join("|")})`,
        "g"
      ),
      '"'
    )
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/&apos;|&#39;|&#x27;|&lsquo;|&rsquo;/gi, "'")
    .replace(/&quot;|&#34;|&#x22;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&amp;/gi, "&");
}

export function escapeText(input: string | undefined | null): string {
  if (!input) return "";
  return normalizeVCardText(String(input))
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
