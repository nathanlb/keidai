# @keidai/ui

Shared component library and design system for Keidai. Built on [shadcn/ui](https://ui.shadcn.com/) (New York style) with Radix primitives and Tailwind 4 tokens.

Consumed by `apps/keidai-ui`. Import components from `@keidai/ui`; import global styles via `@keidai/ui/globals.css`.

**Available exports:** `src/index.ts` (and `src/components/ui/` for implementation). Do not duplicate a component list here — the code is the source of truth.

## Decision tree

When building UI, ask:

1. **Is it a bordered surface?** → `Card` (+ header/content/footer slots)
2. **Is it rows and columns of data?** → `Table`
3. **Is it a modal or overlay flow?** → `Dialog` (or `Sheet` for a side panel)
4. **Is it a click action?** → `Button`
5. **Is it a status label or tag?** → `Badge`
6. **Nothing in `src/index.ts` fits?** → Add the shadcn primitive to this package first (see below)

Do not hand-roll markup in keidai-ui for primitives that belong in the library.

## Adding a primitive

From `packages/ui`:

```bash
npx shadcn@latest add alert
```

1. Component lands in `src/components/ui/`
2. Export it from `src/index.ts`
3. Run `pnpm build` in `packages/ui`
4. Import from `@keidai/ui` in keidai-ui

`components.json` is configured for this package. Do not run shadcn add inside `apps/keidai-ui`.

## Styling

- Use semantic tokens from `src/styles/globals.css` and `src/styles/tokens/` (`bg-card`, `border-border`, `text-muted-foreground`, etc.)
- Prefer `shadow-none` on Cards inside dense operator views (matches existing Torii pages)
- Use `cn()` from `@keidai/ui` for conditional classes
- Icons: `lucide-react` in consuming apps

## Reference implementations

Gold-standard patterns in keidai-ui:

| Pattern | File |
|---------|------|
| Page with summary tiles + Card + Table | `apps/keidai-ui/src/torii/connections/connections-view.tsx` |
| Table row with Badge and Button actions | `apps/keidai-ui/src/torii/connections/connection-server-row.tsx` |
| Grouped Card sections with nested Table | `apps/keidai-ui/src/torii/agents/agents-owners-view.tsx` |
| Dialog multi-step flow | `apps/keidai-ui/src/torii/oauth/oauth-link-dialog.tsx` |
| Expandable provider Card | `apps/keidai-ui/src/torii/oauth/oauth-provider-card.tsx` |

## Agent / contributor checklist

- [ ] Primitives imported from `@keidai/ui`, not raw `<table>`, `<button>`, or card-like bordered `<div>`s
- [ ] New shadcn primitives added here and exported before use in keidai-ui
- [ ] Layout matches an existing reference view where possible
