# Squeek Tx Lab design system

## Overview

Squeek Tx Lab is a compact transaction workbench for people experimenting with
Squeekchain on Sepolia. A pale neutral canvas, white tool surfaces, and a restrained
violet action color carry the interface. The small custom hamster mark links the
wallet tools and the game without turning the page into a marketing landing page.

The product title, Connect control and zero-token Ping action appear on the first
390px screen. Each tool explains its action beside its controls. Read values, user
inputs, transaction reviews and transaction outcomes have distinct presentations.
This document describes the implemented source, principally `src/styles.css`.

## Colors

Canonical colors use hex values. Primitive variables feed semantic role variables;
components use those roles, with a few explicit tonal details for the ping panel.

| Semantic token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#f7f8fa` | Page canvas |
| `--color-surface` | `#ffffff` | Panels, fields and dialogs |
| `--color-subtle` | `#eef0f4` | Hover/disabled surfaces, mobile navigation |
| `--color-border` | `#e0e3e9` | Panel structure and separators |
| `--color-text` | `#202534` | Main text |
| `--color-muted` | `#636b7c` | Supporting text and labels |
| `--color-accent` | `#5b45ce` | Primary action and links |
| `--color-accent-hover` | `#4833b5` | Primary hover |
| `--color-accent-soft` | `#f2effd` | Ping surface and active navigation |
| `--color-focus` | `#5b45ce` | Keyboard outline |
| `--color-success` / `--color-success-bg` | `#18734f` / `#edf7f1` | Confirmed/read state |
| `--color-warning` / `--color-warning-bg` | `#83551b` / `#fff6e8` | Wrong network and pending state |
| `--color-error` / `--color-error-bg` | `#b33241` / `#fff0f1` | Rejections, errors and failures |

Input borders use `#c9cdd6` and placeholders use `#7c8392`. Ping's supporting text
and numeric index use `#665c7c` against `#f2effd`. Status always includes text; dots
and color are supplementary. There is one intentionally light theme. The final
probe measured rendered text contrast and passed every measured pair; evidence and
the original failed pair are in `artifacts/validation.md`.

## Typography

`src/fonts.css` loads two local WOFF2 files from `src/assets/`:

- **DM Sans**, variable normal weights 400–600, for the interface. Fallbacks are
  `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif. Used weights are 400
  and 600. Font loading was inspected in Chromium.
- **IBM Plex Mono**, normal 400, for addresses, hashes, ABI function names and code.
  Fallback is monospace. It is loaded when those values are visible.

The scale has six named steps: `--text-xs` 12px, `--text-sm` 14px, `--text-base` 16px,
`--text-lg` 20px, `--text-xl` 28px, and `--text-display` 36px (28px below 680px).
12px is reserved for dense tool labels, metadata and hints. Descriptions and buttons
use 14px; section headings use 16px; group and dialog headings use 20px. Body
line-height is 1.5, headings 1.15–1.4. The H1 uses -0.045em tracking; section headings
use -0.02em. No tracked uppercase heading labels exist.

Inputs become 16px below 680px to avoid iOS input zoom. Long addresses and hashes wrap
with `overflow-wrap: anywhere`. Amounts are calculated with bigint and use tabular
digits. Wallet balance summaries with more than five fractional digits show an
explicit approximation or small-value bound, plus an **Exact balance** disclosure
containing every digit. Transaction reviews and form summaries preserve exact amounts.
The short wallet control and leaderboard summaries have full-address views elsewhere.

## Layout

The spacing vocabulary is 4, 8, 12, 16, 20, 24, 32 and 40px, defined as `--space-*`
tokens; the component rules use those same literal increments. Gaps within a control
are normally 8px, between fields 18px, between panels 20px, and panel padding 24px.

`App.tsx` owns the one-page shell and hash anchors. The desktop shell has a 212px
sticky sidebar and a flexible workspace. The main content is capped at 1336px, with
40px inline padding. The topbar is in normal flow. Wallet and core use a 1.24:1 grid;
transfer and approval are equal columns; game and launchpad use 1.3:1. Panels have
`min-width: 0` so long values can wrap.

Implemented breakpoints in `src/styles.css`:

| Width | Adaptation |
| --- | --- |
| Up to 1250px | Sidebar 185px; page padding 28px; game leaderboard stacks within its panel; experiment columns become equal. |
| Up to 1000px | Sidebar disappears; compact brand and wrapping section navigation appear. Game and launchpad stack. Launch fields share two columns where space permits. |
| Up to 680px | Page padding 16px; tool panels stack and use 20px padding; wallet, Ping, then core appear in visual order; primary Ping fills its panel. Dialogs become bottom sheets. |
| Up to 360px | Page padding 12px; panel padding 16px; game controls and leaderboard stack. |

The two wallet balances and paired token inputs remain side by side. Mobile navigation
has five compact links with no horizontal scroll. Game and log entries grow vertically.
All critical values wrap; no text-clipping workaround is used. Reflow was checked at
320, 390, 768, 1000 and 1440px. English is the only supported locale; native 200% zoom
and RTL behavior were not verified.

## Elevation & Depth

Panels are flat white surfaces with one structural border and no shadow. The ping
panel uses a violet tint and border. The log's empty state is open space inside its
panel. Modal elevation uses a single `0 20px 80px #20253430` shadow without a border,
and the native dialog backdrop is `#20253470`. There are no decorative gradients,
floating toasts or autoplay animations.

## Shapes

`--radius-sm` is 7px for buttons and inputs, `--radius-md` is 12px for panels, and
`--radius-lg` is 16px for desktop dialogs. Mobile sheets have 20px top corners and
square bottom corners. Status dots and coin marks are circles. Icons are custom
24-unit SVG outlines with 1.7px strokes and `currentColor`, implemented once in
`src/components/Icon.tsx`. Wallet marks retain their vendor colors.

## Components

| Component/pattern | Source | Reuse and states |
| --- | --- | --- |
| `SectionTitle` | `src/components/Shared.tsx` | Icon, semantic H2, optional inline index and a trailing status/control. No eyebrow. |
| `Field` | `src/components/Shared.tsx` | Persistent label, hint or error, `aria-invalid`, `aria-describedby`, optional trailing action. Validation focuses the first invalid field. |
| Buttons | `src/styles.css` | `.primary` for Connect/Ping/review confirmation; `.secondary` for peer tool actions; `.ghost` for quiet actions. 44px normal height, 40px icon controls. Disabled, hover, pressed and focus states. |
| `Modal` | `src/components/Modal.tsx` | Native `dialog.showModal()`, inert background, focus containment/return, Escape, backdrop dismissal and one close control. Optional `wide` configuration dialog. Scrollable at 85–88dvh. |
| `WalletControl` | `src/components/Wallet.tsx` | One connect entry; named extension rows, mobile in-app links and Coinbase. Pending row feedback, rejection recovery, wrong-network switch, address/disconnect view. |
| `Feedback` | `src/components/Shared.tsx` | Stable polite status region, recoverable error or confirmation, and explicitly labeled last-submitted full hash. |
| `AddressLink`, `CopyButton` | `src/components/Shared.tsx` | Wrapping full Etherscan address and separate copy control. Copy success is announced. Hash links have at least 28px target height. |
| Transaction review | `TokenTools.tsx`, `Launchpad.tsx`, `Game.tsx` | Exact amount, destination/contract, network and fee explanation before a wallet request. Account changes invalidate transfer/deployment review. |
| `Gate` and setup state | `Shared.tsx`, `Game.tsx` | Short explanation beside disabled actions. The missing game is explicitly unavailable and offers configuration. No fabricated values. |
| Transaction log | `src/App.tsx` | List, exact hashes, textual status, disclosure for sender/deployment/replacement, native status select and JSON download. |

Keyboard focus uses a 2px accent outline with 3px offset and becomes the system
Highlight color under forced colors. All controls are native interactive elements.
External links keep normal browser link behavior. The page has a skip link and one
main landmark. Primary buttons and wallet rows use a 0.96 pressed scale with
150ms transitions only under `prefers-reduced-motion: no-preference`. Transitions
name their properties; there is no `transition: all` or endless motion.

## Do's and Don'ts

- Add a new lab tool as a semantic section with `SectionTitle`, `Field` and existing
  button variants, inside the main content grid. Add a hash anchor if navigation needs it.
- Use neutral secondary buttons for peer actions and reserve violet fill for the
  next primary action or confirmation. Use status tokens only with a status label.
- Preserve exact recipient addresses, amounts and hashes in review and detail views.
  Do not round values used to build a transaction or show fake data while loading.
- Keep instructions next to the relevant controls. Use the existing empty/error
  patterns rather than alerts or temporary disappearing messages.
- Keep source assets local, maintain the small type scale, and check new content at
  320 and 390px. Do not add nested decorative cards or shadows to bordered panels.
- Route every write through the existing guarded transaction layer. A visual change
  must not silently change a contract, ABI, network or transaction meaning.
