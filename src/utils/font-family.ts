/**
 * The family names of a `fontFamily` value, as a list.
 *
 * The format says a string is one family and an array several, but authors
 * write the CSS habit (`"'Plex Sans', system-ui, sans-serif"`) anyway. No real
 * font name holds a comma, so a string is split at commas outside quotes; each
 * part is trimmed and one pair of matching surrounding quotes removed. An array
 * is returned as it is.
 *
 * @throws when a part of a string is empty (`"Inter,"`, `", serif"`)
 */
export function fontFamilyNames(value: string | string[]): string[] {
  if (Array.isArray(value)) return value;
  const parts: string[] = [];
  let quote = '';
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ',' || i === value.length) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  return parts.map((part) => {
    if (!part) throw new Error(`fontFamily "${value}" has an empty family name.`);
    const q = part[0];
    return part.length > 1 && (q === '"' || q === "'") && part.endsWith(q) ? part.slice(1, -1).trim() : part;
  });
}

/** Whether a `fontFamily` string holds a comma outside quotes, so is a list. */
export function isFontFamilyList(value: string): boolean {
  let quote = '';
  for (const c of value) {
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ',') return true;
  }
  return false;
}
