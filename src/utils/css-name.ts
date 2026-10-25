/**
 * A name as a CSS identifier, by the CSSOM rule: inside it, each capital becomes
 * a hyphen and its lowercase (`backgroundColor` → `background-color`), the rule
 * CSS uses between `element.style.backgroundColor` and `background-color`.
 *
 * Two departures, both at the edges. A capital that starts the name (or follows
 * whitespace) is lowercased with no hyphen, so `Colors` is `colors`, where the
 * CSSOM would give `-colors`; a vendor property is spelled with its own leading
 * hyphen instead, which is kept (`-webkitLineClamp` → `-webkit-line-clamp`).
 * Whitespace, legal in a DTCG name and not in an identifier, becomes `-`.
 * Acronyms come out letter by letter: `textURL` is `text-u-r-l`.
 *
 * @param name - One name: a token path segment, or a group's key
 */
export function cssIdentifier(name: string): string {
  // A capital after a literal `-` still gets its own hyphen (`pad-X` → `pad--x`), as the CSSOM's rule would.
  return name.replace(/(\s+)?([A-Z])|\s+/g, (_, space: string | undefined, capital: string | undefined, offset: number) =>
    capital === undefined ? '-' : `${space || offset > 0 ? '-' : ''}${capital.toLowerCase()}`,
  );
}

/**
 * A token's CSS custom-property name: `ds.surface.accent` → `--surface-accent`.
 *
 * The token path without the collection segment, each segment spelled by
 * {@link cssIdentifier} and joined by `-`: `ds.button.backgroundColor` is
 * `--button-background-color`.
 *
 * It lives in the core because two adapters must agree on it: the CSS adapter
 * declares and references the property, and the Figma adapter writes the same
 * name as a variable's code syntax. An adapter cannot import from another.
 *
 * @param lookupPath - A lookup path, `collectionName.tokenPath`
 * @returns The property name, `--` included
 */
export function cssPropertyName(lookupPath: string): string {
  return `--${lookupPath.split('.').slice(1).map(cssIdentifier).join('-')}`;
}

/**
 * The CSS custom-property name of a chain's link: the head's property, two hyphens, the modifier as written.
 * `--surface-raised` and `colorScheme` give `--surface-raised--colorScheme`.
 *
 * The modifier keeps its spelling, so the name reads back to the modifier it came from. Only what an identifier
 * cannot hold changes: whitespace becomes `-`, and any other such character is escaped. Both adapters call it: the
 * CSS adapter declares the link, and the Figma adapter writes it as a link variable's code syntax.
 *
 * @param head - The head token's custom property, `cssPropertyName(lookupPath)` unless an adapter names it otherwise
 * @param modifier - The link's modifier, as the document names it (or a folded axis, as the vocabulary names it)
 */
export function cssLinkName(head: string, modifier: string): string {
  return `${head}--${modifier.replace(/\s+/g, '-').replace(/[^\w\u0080-\uffff-]/g, (c) => `\\${c}`)}`;
}
