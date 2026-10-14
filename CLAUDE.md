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

## The goal right now

Deployment to real users is planned for **Wednesday 21 or Friday 23 October
2026**. Until then: polish what exists and fix its logic and flows. **No new
features** until the existing system is at full product quality, the level
of the references below. Prefer clean UI and simplicity; remove what is not
needed. When in doubt, cut rather than add.

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

## Design system (from 14–15 Oct 2026; portal and admin share it)

- References: ramp.com/procurement and mercury.com for structure and tone,
  linear.app for restraint, godly.website (now recent.design) for finish.
  The bar is a product company's app, not a government website.
- Type: **Geist** everywhere (admin `--font-sans` too). Geist Mono only for
  document numbers (PR-2026-000243). Amounts and counts use Geist with
  `tabular-nums`; the mono slashed zero made ₱43,000 read like code.
- Colour: white page, ink #16181d for actions, the municipal seal is the
  only colour. Muted text #5b606b; labels #6b707a; borders #e6e6e3 / #ececea;
  row rules #f0f0ee; hover #fafaf9; rail ground #fafaf9. Hex, never oklch.
- Shapes: 10px buttons/inputs, 14px panels, 44px touch targets.
- Admin shell: always-open sidebar sections (Procurement, Supply, Services,
  Utilities, Records), sentence-case labels, current page = white card,
  counts = quiet grey numbers. Top bar holds only the bell and the profile
  menu (Settings, Sign out). No breadcrumb when it would repeat the title.
- Tables (shared `EnterpriseTable`): no header band or capitals, 12.5px
  labels, 13.5px rows. `StatusBadge` = coloured dot + the word.
- List page pattern (see `pr-list-page.tsx`): title + one-line purpose,
  Export and the primary action in the header, status **tabs with counts**
  instead of a status dropdown, the record's purpose as the main cell text
  with its number and person beneath. No Print button that prints the
  screen. No duplicate buttons that call the same function.
- Dashboard pattern (`dashboard-page.tsx`): "Needs your attention" rows,
  each one click from the work, then four figures, then short lists.
- Forms: one page, no attachments, a sticky Summary on the right with a
  checklist and the one submit button (PR, RIS, Facility Reservation).
- Rejected, do not reuse: the Figma PR redesign (ADU7hH4Y6BRcBcL6DvL4D1); a
  live "official form preview" beside a form; collapsible sidebar groups.

## Where the work stands (15 Oct 2026)

Done: portal home, receipt with QR, "Filed on this computer", one-page PR /
RIS / Reservation forms, office dropdown (codes), stock suggestions
(migration 050, already run). Admin: dead and duplicate controls removed,
sidebar and naming ("Ordinance violations"), dashboard, all tables and
statuses, the Purchase requests list.

Next, one screen at a time, same patterns, screenshot the live page after
each: Purchase orders, Requisition & issue slips, Inventory (cut its six
KPI cards), Facility reservations (calendar chips need facility names and a
legend), Ordinance violations, Energy/Water/Fuel (an unbilled account still
shows "No Change"), Reports, Audit trail, Settings, then the detail drawers,
the admin forms, and phone layouts (lists need cards, not sideways scroll).
Zaf rates the system under 70% of production grade; ask him what he still
wants to achieve before deciding what is "done".

**Do not touch Records Management** (src/features/records, src/pages/records,
migration 049): someone else is building it and its workflow is not settled.

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
