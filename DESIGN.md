---
# gstack: design-md-format=spec
name: WhatsAppCRM
description: Night-shift proof over promise — dark, unornamented, one accent, the bot answering live instead of a screenshot claiming it does.
colors:
  background: "#0B0D0B"
  surface: "#151A14"
  surface-2: "#1D231C"
  paper: "#EFE9DC"
  primary: "#C6F24E"
  on-primary: "#0B0D0B"
  accent: "#FF7A2F"
  text: "#EFE9DC"
  text-muted: "#8A9186"
  line: "#262C24"
  success: "#7FE08A"
  warning: "#FF7A2F"
  error: "#FF5A4E"
  info: "#8FD3E8"
typography:
  display:
    fontFamily: Unbounded
    fontWeight: 900
    fontSize: clamp(2.4rem, 5.6vw, 4.4rem)
    letterSpacing: -0.01em
  body:
    fontFamily: Golos Text
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    letterSpacing: 0.04em
  mono:
    fontFamily: JetBrains Mono
    fontFeature: tnum
rounded:
  sm: 4px
  md: 8px
  lg: 14px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "#D8FF6E"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text}"
    borderColor: "{colors.line}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  input:
    borderColor: "{colors.line}"
    rounded: "{rounded.sm}"
  nav-link:
    textColor: "{colors.text-muted}"
  nav-link-active:
    textColor: "{colors.text}"
    borderColor: "{colors.primary}"
  status-pill-draft:
    backgroundColor: "color-mix(in srgb, {colors.accent} 18%, transparent)"
    textColor: "{colors.accent}"
  status-pill-confirmed:
    backgroundColor: "color-mix(in srgb, {colors.primary} 18%, transparent)"
    textColor: "{colors.primary}"
---

# WhatsAppCRM

## Overview

**Creative North Star:** Brutally minimal with one controlled moment of nerve — the product proves itself instead of a stock photo or a customer-logo wall claiming it on the product's behalf.

**Product context:** WhatsAppCRM is a working SaaS platform for small and medium businesses in Kazakhstan (shops, delivery, local services). The owner writes a prompt once; an AI bot answers customers in WhatsApp and Telegram and extracts orders into a configurable table, exportable to Excel/CSV. Direct competitors: Wati.io, Respond.io, Landbot.io. Peers for craft: Linear.app.

**Mode per surface:**
- Landing / marketing — Persuade
- `/orders`, `/channels`, `/chat` (the actual app) — Operate
- `/login`, `/signup` — Operate (short, low-friction)

**Reference sites:** wati.io, landbot.io (category baseline — pastel gradient-blob templates, avoided), respond.io, linear.app (dark + restraint + real product screenshots, followed)

**Key characteristics:**
- Near-black night background, one lime accent used only for "live/working" states and the primary CTA — never decorative
- A single warm paper-colored section (the Excel export moment) breaks the dark for exactly one beat
- The hero shows a real, typeable chat demo and a ticker of real order timestamps instead of a screenshot or illustration
- No customer logos, no compliance badges, no "10,000+ businesses" — trust comes from watching the product work
- Heavy condensed display type reads like a statement painted on a wall, not a value proposition

## Colors

**Strategy:** Committed — one dark ground owns the page, one accent (lime) carries all interactive/live meaning, a second accent (amber) is reserved exclusively for night timestamps so it never competes with the CTA color for attention.

**Light or dark:** Dark. The product's own use scene is a phone screen glowing in a dark room at 2 AM — that's literally who this page is for and when they're most likely looking at it. The one light (`paper`) section is deliberate contrast, not a mode: it marks the single moment the copy turns from "watch this happen" to "here is your report," and should never spread past that one section.

`primary` (lime, `#C6F24E`) is the only token that means "this is alive right now" — the pulsing live-dot, the typing indicator's implied state, the primary CTA. `accent` (amber, `#FF7A2F`) means "this happened while you weren't looking" — night order timestamps only. Never mix the two in the same element. `text-muted` carries all secondary copy; full-opacity `text` is reserved for content that is making the argument (headline, chat bubbles, table rows), not for chrome.

Dark surfaces step up in lightness with each layer (`background` → `surface` → `surface-2`) rather than adding shadow — there is no ambient light source to cast one.

## Typography

Unbounded, Golos Text and JetBrains Mono are all free (Google Fonts), all verified for full Cyrillic coverage — required, since the product and its audience are Russian/Kazakh-first. (An earlier direction proposed Druk Text Cyrillic + Graphik LCG for the same heavy-condensed feel; both are paid Commercial Type licenses and were swapped out as out of scope for a bootstrapped student project. Revisit if the product ever budgets for custom type.)

- **Display** (Unbounded, weight 900): headlines only. Heavy and geometric enough to read as a poster statement rather than a SaaS tagline. Never below H2 scale — if it needs to be smaller than that, it's not a headline, use body.
- **Body** (Golos Text): all paragraph copy and UI text. Designed for Cyrillic interfaces specifically, which is why it reads warmer than a transliterated Latin grotesk at the same weight.
- **Mono** (JetBrains Mono, tabular figures): timestamps, table data, order fields, anything that is evidence rather than persuasion. This is the typeface doing the "proof, not promise" work — it should look like machine output because it is.

Load via `<link>` to Google Fonts (`Unbounded:wght@500;700;900`, `Golos+Text:wght@400;500;600;700`, `JetBrains+Mono:wght@400;500;600`) with `display=swap`.

## Layout

Hybrid: the hero deliberately breaks the grid (chat demo and ticker sit as two unequal, asymmetric blocks, not a centered single column) because it's the one place the product needs to feel alive rather than organized. Every section after it — proof list, how-it-works, palette/typography reference, the `/orders` screen — returns to a disciplined single grid at `max-width: 1180px`.

Density: generous in the hero (this is the persuasion moment, let it breathe), tighter in any section that shows real data (the order ticker, the CSV card, the `/orders` table) — the contrast in density is itself a signal: loose = a human making a case, tight = a machine reporting facts.

## Elevation & Depth

No shadows, no glow halos — there is no light source in a near-black scene to justify either. Depth comes from surface-lightness steps (`background` < `surface` < `surface-2`) and 1px `line` borders only.

## Shapes

Radius scale: `sm` (4px, inputs, ticker rows) < `md` (8px, buttons) < `lg` (14px, cards, the chat demo panel, the paper section). Never uniform — a button and a card sharing one radius reads as a template default. `full` is reserved for pills and the live-status dot only.

## Components

- **button-primary** — solid `primary` fill, `on-primary` text, no gradient, no glow. Hover: single fixed hex shift (`#D8FF6E`), not an opacity trick.
- **button-ghost** — transparent, `line`-colored border; hover brightens the border to `text-muted`, never fills the background.
- **card** — `surface` background, `lg` radius, 1px `line` border. Never nested inside another card.
- **status-pill** — `draft` (amber tint) and `confirmed` (lime tint) are the only two states that exist today; both derive their color from the token they reuse, never a hardcoded third color.
- **chat-demo** — the one component allowed genuine motion (live-dot pulse, typing dots) because it is the product, not decoration.

All interactive components need hover, focus-visible (a `2px` `primary` outline, never removed), and disabled states before shipping — none exist yet beyond the preview.

## Do's and Don'ts

- Do: keep `primary` (lime) exclusive to CTAs and "live" states — the moment it's used decoratively, it stops meaning anything.
- Do: let the mono typeface carry every piece of real data (timestamps, order rows, table cells) — it's load-bearing for the "proof not promise" argument, not a stylistic accent.
- Do: keep the `paper` section to exactly one appearance per page — it's a punctuation mark, not a second theme.
- Don't: add a customer-logo strip, star ratings, or a compliance badge row — this system's trust argument is the live product, not borrowed authority.
- Don't: put a radial glow or gradient behind the hero content — depth here comes from surface steps, not light effects.
- Don't: reuse `accent` (amber) for anything except night timestamps, or it stops distinguishing "this happened automatically" from "this is happening now."

## Motion

- **Approach:** intentional — the live-dot pulse and typing indicator are functional signals, not choreography; scroll entrances are a simple fade/rise, nothing sequenced or bouncy.
- **Easing:** enter (ease-out) · exit (ease-in) · move (ease-in-out)
- **Duration:** micro 80ms (typing dots) · short 200ms (hover states) · medium 300ms (scroll fade-in) · long — unused, this system has no long transitions
- **The one authored moment:** the hero chat demo "typing" before a reply appears — it's the single place motion is doing narrative work, everywhere else it's just feedback.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-17 | Initial design system created ("Night Shift") | /design-consultation, based on competitive research (wati.io, respond.io, landbot.io, linear.app) and an independent Claude subagent design proposal; landing page for the multichannel-platform diploma project |
| 2026-09-17 | Display/body fonts swapped from Druk Text Cyrillic + Graphik LCG to Unbounded + Golos Text | Subagent's original picks are paid Commercial Type licenses; swapped for free, Cyrillic-verified Google Fonts equivalents to fit a bootstrapped student project budget |
