# @toghen/lib

The core engine of Toghen: `DesignToken`, `Collection` and `DesignSystem`, and the W3C `Resolver`.

Toghen is a design-tokens toolkit split into one repository per package. What the repositories share lives in house.

The rules are in the constitution, at `.specify/memory/constitution.md`: the shared principles and this package's own section. Read it before changing anything. This file holds only what is not a rule.

## The docs

| Doc | What it is |
|---|---|
| `guide.md` | How to use it: setup, workflows, examples |
| `reference.md` | The API surface: signatures, protocol, schemas |
| `specs.md` | Why it is built this way: architecture, contracts, decisions, open questions |
| `decisions.md` | The archive: dated rulings, what was considered and rejected, what the build found, superseded sections, open questions |
| `model.md` | The component model, the running example and the glossary |

## Commands

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check   # coming in the tooling round
```
