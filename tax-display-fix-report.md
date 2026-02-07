# Tax Display Fix Report

## Bug summary
- Line item prices on the site "Thank you" page were showing tax-included amounts (e.g., $10.87) while Tax was also listed separately.
- Confirmation emails (customer + owner) showed the same inflated line item prices and an incorrect Subtotal (also tax-included), even though Tax and Total were correct.

## Root cause (confirmed)
Stripe line items expose two totals:
- amount_subtotal = pre-tax line amount (after discounts)
- amount_total = line amount including tax

The code was displaying amount_total for line items and also summing amount_total for Subtotal in emails. That is why a $10.00 item in a $15.00 taxable order showed about $10.87:

$10.00 + $1.31 * (10 / 15) = 10.873...

Exact offending usages (pre-fix):
- functions/api/checkout/session/[id].ts -> lineTotal = li.amount_total
- functions/_lib/emailTotals.ts -> sumNonShippingLines used line.amount_total
- functions/api/webhooks/stripe.ts -> email item amountCents used line.amount_total

These were display/mapping bugs, not tax logic bugs.

## Fix summary (minimal)
- Use Stripe pre-tax amounts everywhere for item lines and subtotal:
  - amount_subtotal (line items)
  - amount_subtotal (session subtotal)
- Keep tax/shipping/total from Stripe as-is.

### Code changes
- functions/api/checkout/session/[id].ts
  - Added lineSubtotal + unitAmount.
  - lineSubtotal uses amount_subtotal (fallback to unit_amount * qty).
- src/lib/payments/checkout.ts
  - Added lineSubtotal + unitAmount fields for session line items.
- src/pages/CheckoutReturnPage.tsx
  - Display line items using lineSubtotal (fallback to lineTotal).
- functions/_lib/emailTotals.ts
  - Subtotal now sums amount_subtotal (fallback to amount_total if missing).
- functions/api/lib/shipping.ts
  - Shipping extraction prefers amount_subtotal to avoid tax-inclusive shipping totals.
- functions/api/webhooks/stripe.ts
  - Email line item amounts use amount_subtotal (fallbacks remain).

## Verification checklist
1) Single item, taxable shipping (NY example)
   - Item: $10.00
   - Shipping: $5.00
   - Tax: $1.31
   - Total: $16.31
   Expected:
   - Line item price: $10.00
   - Subtotal: $10.00
   - Shipping: $5.00
   - Tax: $1.31
   - Total: $16.31

2) Two different items
   - Each line shows base unit price
   - Subtotal equals sum(base line totals)
   - Tax and Total match Stripe

3) Emails
   - Owner "New Sale" email matches the same breakdown
   - Customer confirmation email matches the same breakdown

## Notes
- This fix does not alter Stripe Tax configuration or calculations.
- Order persistence already stores base unit prices (order_items.price_cents uses Stripe price unit_amount), so no schema change was needed.
