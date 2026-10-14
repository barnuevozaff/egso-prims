# GSO PRIMS

Purchase Request & Inventory Management System for the General Services Office,
Municipality of Alaminos, Laguna. The owner is Zaf; he writes in Taglish and
reads replies in Taglish.

Stack (locked): React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, Supabase,
Motion, React Hook Form + Zod, TanStack Table, React Router, Lucide.

## Where it runs

- Pushing `main` deploys to Vercel. The only URL to give Zaf is
  **https://egso-prims.vercel.app**. Hashed deployment URLs
  (`egso-prims-xxxx-egsoalaminos-5316s-projects.vercel.app`) are frozen
  snapshots; he reloads them and thinks a change failed.
- Verify on the live URL, not a local dev server.
- There are no real users yet; the live site is a progress link.
- The repo is **barnuevozaff/egso-prims** (moved from egsoalaminos on
  15 Oct 2026; egsoalaminos is a collaborator). Vercel's Git connection points
  at it, so a push to `main` deploys.

## How to work with Zaf

- **Mockup before code.** Design changes are drawn first on the canvas
  https://claude.ai/artifact/YbWygaVcRHf5Kus9b7ovcD and coded only after he
  says "approved". One screen at a time.
- **Give very specific instructions** whenever he has to do something: which
  app or window, the exact text in its own code block, what he will see, which
  password, and what happens if he skips it.
- **Check every UI change against UX/UI principles before pushing** and tell him
  what passed and what you fixed: one primary action per area, text contrast
  4.5:1 (placeholders too), targets ≥ 44px, a label on every input, clear error
  and empty states, colour never the only signal, keyboard focus visible.
- **Every screen needs a complete desktop view.** No half-empty regions at
  1440–1680px; content that only appears with data needs an empty state. After
  pushing, screenshot the live page at about 1680×1050 and look at it before
  saying it is done.
- Report honestly: say what you did not check.

## Design direction (portal polish pass, from 14 Oct 2026)

- References: ramp.com/procurement and mercury.com for structure and tone,
  linear.app for restraint, godly.website (now recent.design) for finish details.
- Portal: white page, ink (#16181d) actions, the municipal seal is the only
  colour. Geist for text, Geist Mono for reference numbers and peso amounts.
  Values are recorded in `DESIGN.md`. The admin still uses Inter.
- Rejected, do not reuse: the Figma PR redesign (file ADU7hH4Y6BRcBcL6DvL4D1),
  and a live "official form preview" beside the PR form (the admin prints the
  real format).
- Done so far: portal home, receipt with QR, "Filed on this computer", the
  one-page PR form (no attachments; shared with admin create/edit). Next: RIS
  and Facility Reservation forms in the same style, then the Track page.
- The portal audience is staff of other municipal offices, not the public.
  Keep government terms (Fund, Division, FPP Code).

## Rules that bite

- **Office PCs run Chrome 109.** Keep `chrome109`/`edge109` in
  `build.cssTarget` (vite.config.ts). Check newer CSS features (subgrid,
  container queries, `@starting-style`, popover, view transitions,
  `text-wrap: balance`) before using them. Built CSS must contain no `oklch(`.
- **Printed forms must match the official government forms.** Print wins over
  screen looks. For paper-replica records forms the entry screen copies the
  paper too.
- **Never run `supabase db push`** or any migration replay. The Supabase
  migration ledger is empty although every file in `supabase/migrations/` has
  been applied by hand; replaying would hit production data. New migrations are
  run by Zaf in the Supabase SQL Editor, one file at a time.
- Anonymous reads of `purchase_requests`, `purchase_orders`, `ris_requests` and
  `reservations` are intentional. Do not report them.
- The admin has one design and no dark mode or theme switcher. Do not add them.
- Never bulk-edit Tailwind classes with a regex; type sizes stay literal.
- Do not commit someone else's unfinished work along with yours. Commit only the
  paths you changed.
