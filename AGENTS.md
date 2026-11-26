# Agent instructions

Instructions for any coding agent working in this repository.

## What this repository is

A static page that searches the Registry of Open Data on AWS and browses the
public S3 buckets of its datasets. It is read-only and anonymous. There is no
application server.

## Before you start

- Node 26 (`.nvmrc`). Use `npm ci`, not `npm install`, when reproducing CI.
- `npm run index` builds the dataset index (about 3 minutes, needs network).
  `npm run index -- --no-probe` skips the bucket check and takes seconds, but
  then keeps unlistable datasets too.
  The app does not render without an index.

## The checks that must pass

Run all of these before proposing a change. CI runs the same set.

```
npm run format:check   npm run lint      npm run lint:css
npm run typecheck      npm run test      npm run build
npm run test:e2e
```

## Rules that are not negotiable

1. **No credentials, ever.** Every S3 request is unsigned. Do not add AWS SDK
   signing, Cognito, or any sign-in. A bucket that needs credentials is out of
   scope.
2. **Show only what a web page can list.** The indexer drops every dataset
   with no bucket that a page can list, and moves unlistable buckets to
   `otherResources`. Do not bring them back as browse targets: no "show all"
   switch, no CLI fallback screen, no "try anyway" button. The metadata panel
   lists a kept dataset's unlistable buckets with its other registry resources,
   and that is the only place they appear.
3. **Registry Markdown and file contents are untrusted.**
   `src/components/Markdown.tsx` renders Markdown without raw HTML, and the
   JSON preview renders values as text. HTML files are not previewed: they
   open in a new tab, on the bucket's origin. Do not add `rehype-raw`,
   `dangerouslySetInnerHTML`, or an `iframe` for file contents.
4. **Do not weaken the TypeScript config.** `exactOptionalPropertyTypes` rejects
   a possibly-undefined value passed to an optional prop. Declare the prop
   `?: T | undefined`, or spread it in conditionally. Do not turn the flag off.
5. **Do not disable a lint rule to get past it.** If a rule is wrong here,
   change it in `eslint.config.js` or `.stylelintrc.json` with a reason.
6. **Generated files are not committed.** `public/data/` is built by
   `npm run index`.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`. The subject
  says what changed. The body says why.
- **Styling** is Primer components plus CSS Modules, one `.module.css` beside
  its component. Use Primer tokens (`var(--fgColor-muted)`), not raw colours.
  Stylelint's `custom-property-pattern` is off because Primer token names use
  camelCase segments.
- **CSS Module classes on Primer components.** With `noUncheckedIndexedAccess`,
  `styles.x` is `string | undefined`, and Primer's `className?: string` rejects
  it. Put the class on a wrapper element instead.
- **State** lives in `src/state/` as plain stores, read with
  `useSyncExternalStore`. The URL is the state that matters: see
  `src/modules/route/route.ts`.
- **Modules over components** for anything testable. Put logic in
  `src/modules/` or `scripts/`, where it can be unit-tested without rendering.

## Comments

Comments explain why the code is surprising, not how it was discovered. Keep a
comment where someone might otherwise "simplify" the code and break it. The
investigation (what was measured, what failed) belongs in a commit message,
not in the source.

## Working with uncertainty

- If a fact about S3 or the registry matters, verify it with a real request.
  The registry has wrong regions, string booleans, and YAML that only lenient
  parsers accept.
- If a change is blocked on a decision only a human can make, say so and stop.
- State what you did not do.
