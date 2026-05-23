// Escaping per RFC6350 (vCard 4.0):
// - Backslash -> \\
// - Comma -> \,
// - Semicolon -> \;
// - Newline (CR or LF) -> \n
function decodeTextEntities(input: string): string {
  return input
    .replace(/&apos;|&#39;|&#x27;|&lsquo;|&rsquo;/gi, "'")
    .replace(/&quot;|&#34;|&#x22;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&amp;/gi, "&");
}

export function escapeText(input: string | undefined | null): string {
  if (!input) return "";
  return decodeTextEntities(String(input))
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
