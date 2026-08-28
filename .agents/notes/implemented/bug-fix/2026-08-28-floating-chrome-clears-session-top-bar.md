# Agent Note: Floating chrome clears the session top bar on framed desktops

Status: implemented

English | [中文](2026-08-28-floating-chrome-clears-session-top-bar.zh.md)

## Problem

The desktop panel toolbar (pinned summary, terminal, side panel) is a floating
element fixed at `top: 5px; right: 14px` with the maximum z-index. macOS and
Windows reserve an in-page title bar row on `<body>`, so their content starts
below it. Framed platforms (Linux) keep the native window title bar and reserve
nothing, so the conversation column starts at y=0 — and its top bar parks a
`Session log` control (111px wide, inset 28px) in exactly the corner the
toolbar occupies. The toolbar covered it: an active session could not reach its
own session log button, and the toolbar's hit area silently swallowed the
click.

## Decision

`desktop-frame` publishes two facts about its own layout on the root element,
because floating chrome is mounted outside the frame and can only read them
from there:

- `--oh-dsh-details-width` — the current width of the session details column,
  `0px` when collapsed.
- `data-oh-dsh-session-active` — present while a non-blank session is current,
  which is exactly when the conversation top bar renders its controls.

The side tools panel publishes a third fact the same way —
`--oh-dsh-workspace-panel-inset`, the panel's width plus its distance from the
right edge, `0px` while it is closed — and marks
`data-oh-dsh-side-panel-maximized` when it is maximized. The toolbar's `right`
is then

```css
min(
  max(
    14px,
    calc(
      8px
      + var(--oh-dsh-details-width, 0px)
      + var(--oh-dsh-session-inset, 0px)
      + var(--oh-dsh-workspace-panel-inset, 0px)
    )
  ),
  calc(100vw - 460px)
)
```

The insets **add up**, because the side panel squeezes the conversation column
rather than covering it: `Session log` travels left by exactly the panel's
width, so clearing the panel alone lands the toolbar on top of it. The session
inset is the measured footprint of that control — 111px button plus its 28px
inset — swapped in from `0px` by the `data-oh-dsh-session-active` rule, and one
8px gap is added once for whatever the toolbar yields to. `min()` caps the
result so a stacked layout cannot push the toolbar across the session list.

Vertical placement is part of the same contract: while a session is active the
toolbar sits at `top: 11px` with 28px buttons, matching the `Session log`
button's height and center line instead of hovering half a row above it.

A maximized side panel owns the top row end to end — `Session log` is squeezed
to the far left and no horizontal inset can clear it — so the toolbar drops to
the bottom-right corner instead of hanging in the middle of the panel. It stays
visible and clickable, because the panel header carries back, close-tab, and
close controls but no restore control of its own.

The pinned-summary panel takes the details-width term only; it already sits
below the top bar, and it is mutually exclusive with the side tools panel.
macOS and Windows keep their own `right` overrides, because their title bar row
makes the conflict impossible and moving them would only drift the toolbar away
from the corner.

Measured on Linux at a 1282px viewport. With a session open the toolbar spans
1040..1135 and `Session log` starts at 1143 — an 8px gap, both centred on
y=28, with no interactive element anywhere under the toolbar. Opening the side
tools panel (480px wide) moves `Session log` to 663 and the toolbar to 560..655
— the same 8px gap, the same centre line. Maximizing the panel moves the toolbar
to the bottom-right corner at 1173..1268 / y=765, still visible and clickable.
Opening the details column moves the toolbar and the control it yields to by the
same amount, so the gap is constant.

## Alternatives considered

**Reserve a chrome row inside the frame on framed platforms.** Built first and
rejected: Linux already renders the native window title bar, so a 40px empty
row reads as wasted space rather than as chrome. It was the visually worst
option and was reverted.

**Drop the toolbar below the conversation top bar (`top: 52px`).** Rejected
because it floats over conversation content instead of the window edge, and it
collides with the pinned-summary panel, which opens at `top: 48px`.

**Move the toolbar to another corner.** Rejected because the bottom edge
belongs to the terminal panel and the composer, and because a panel control
strip belongs at the window's top edge on every platform.

**Pad the upstream top bar so `Session log` moves left.** Rejected because the
element lives inside an upstream CSS-module tree; a selector tuned to hashed
class names breaks on every upstream release.

**Apply the inset unconditionally.** Rejected because no session means no
`Session log` control, and a permanently inset toolbar would hover away from
the corner for no visible reason.

**Combine the insets with `max()` instead of adding them.** Built and rejected:
the side panel does not cover the conversation column, it squeezes it, so
`Session log` travels left with it. Taking the maximum cleared the panel but
landed the toolbar on `Session log` again, 81px of overlap.

**Keep the top-right inset while the panel is maximized.** Rejected as the
original defect: the panel is then as wide as the viewport, `Session log` is
squeezed to x=96, and the `min()` cap parks the toolbar at 359..460 — dead
centre of the panel, which is exactly what the first report described.

**Hide the toolbar while the panel is maximized.** Rejected because the panel
header exposes back, close-tab, and close but no restore control, and the
maximized state survives closing the panel: hiding the only toggle would strand
the user in a maximized panel.

**Read the panel's width from the layout store.** Rejected because the panel is
maximized and styled by CSS, so only the mounted element knows its real
footprint; a `ResizeObserver` on that element stays correct through drags,
maximize, and viewport changes.

## Consequences

Three small contracts now connect the frame and the side tools panel to the
floating chrome: two CSS custom properties, one root attribute, and the
`max()` / `min()` composition that keeps them from stacking. The toolbar still
owns its placement and reads no layout state of its own, so `sidebar` stays
decoupled from the frame's store and from the panel's width. The 147px inset is
an agreement with the upstream top bar's layout: if that control's width
changes, the variable is the single place to update. The panel's footprint is
measured at runtime, so resize and maximize need no extra plumbing. Tests in
`tests/desktop-titlebar.test.ts` pin the published width, the session-active
attribute, the panel inset, and the composed `right` rule, so a silent
regression fails the suite instead of the user's next click.
