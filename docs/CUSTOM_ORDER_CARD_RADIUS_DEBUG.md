# Custom Orders Card Radius Debug

## Visible card element
- Element: the Custom Orders text card wrapper `div` inside `src/pages/HomePage.tsx`.
- It carries the background (`bg-white`), border (`border border-slate-200`), and shadow (`shadow-md`).

## Where rounding was applied
- `rounded-md` was added to the card wrapper `div`.

## Why rounding did not show
- `src/index.css` globally forces all Tailwind rounding utilities to square corners:
  - The selector list includes `.rounded-md` and sets `border-radius: 0 !important;`.
  - This overrides Tailwind utilities everywhere, so `rounded-md` has no visible effect.

## Minimal fix
- Add a local override class `custom-order-card` with `border-radius: 0.375rem !important;`.
- Apply `custom-order-card` to the Custom Orders card wrapper `div` (same element with bg/border/shadow).
- Add `data-testid="custom-order-card"` for inspection.

## Files touched
- `src/pages/HomePage.tsx`
- `src/index.css`
- `docs/CUSTOM_ORDER_CARD_RADIUS_DEBUG.md`
