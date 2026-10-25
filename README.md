# @toghen/lib

The core of [Toghen](https://codeberg.org/Toghen): a W3C DTCG design-tokens engine. It reads tokens in the [Format](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/) and resolves them through the [Resolver](https://www.w3.org/community/reports/design-tokens/CG-FINAL-resolver-20251028/): references, and every context of every modifier a resolver document declares. Adapters translate its output; they never redefine it.

```sh
pnpm add @toghen/lib
```

To use a commit not yet released, install it from the repository by git URL with pnpm; see [installing from the repository](https://codeberg.org/Toghen/lib/src/branch/main/guide.md#from-the-repository).

```ts
import { readFile } from 'node:fs/promises';
import { load, Resolver } from '@toghen/lib';

const { document } = await load('ds.resolver.json', { read: (path) => readFile(path, 'utf8') });
const ds = new Resolver(document).resolveContextsToDesignSystem();

ds.resolveValue('ds.surface.accent', 'theme=dark').hex; // '#5c9bff'
```

Tokens are immutable, references resolve recursively with circular detection, and an unresolvable reference is an error rather than text passed through. The only runtime dependency is [`culori`](https://culorijs.org/).

The [model](https://codeberg.org/Toghen/lib/src/branch/main/model.md) explains how tokens, modifiers and components fit together. The [guide](https://codeberg.org/Toghen/lib/src/branch/main/guide.md) shows how to do each task, and the [reference](https://codeberg.org/Toghen/lib/src/branch/main/reference.md) lists the API.

## License

MIT. See [LICENSE](https://codeberg.org/Toghen/lib/src/branch/main/LICENSE).
