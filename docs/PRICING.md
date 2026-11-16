# Pricing and credits

**Model: hybrid.** A subscription unlocks features and limits and includes a monthly credit allowance. Credit packs top up AI usage at any time. Every AI action costs credits. Source of truth: `packages/shared/src/plans.ts` and `credits.ts`.

## Plans

| Plan     | Monthly | Yearly | Credits / mo | Channels | Brands | Seats | Contacts | Emails / mo |
| -------- | ------- | ------ | ------------ | -------- | ------ | ----- | -------- | ----------- |
| Free     | $0      | —      | 100          | 3        | 1      | 1     | 250      | 500         |
| Creator  | $29     | $290   | 1,500        | 8        | 1      | 1     | 2,500    | 10,000      |
| Business | $79     | $790   | 5,000        | 25       | 3      | 3     | 15,000   | 50,000      |
| Agency   | $199    | $1,990 | 15,000       | 75       | 15     | 10    | 75,000   | 250,000     |

AI video and the AI analyst start at Creator. Approval workflows and full analytics history start at Business.

## Credit packs

| Pack   | Price | $ / credit |
| ------ | ----- | ---------- |
| 1,000  | $15   | 0.0150     |
| 5,000  | $60   | 0.0120     |
| 15,000 | $150  | 0.0100     |

## How we don't lose money on AI

1. **Cost ceiling per credit.** `CREDIT_COGS_CEILING_USD = 0.005`. Each action is priced `ceil(estimated provider cost / 0.005)` credits, so one credit never costs us more than half a cent. The cheapest retail credit is $0.010, so the worst-case gross margin on AI is about 50% (largest pack) and 62–74% on subscription allowances. A unit test fails the build if a plan or pack ever drops below 2× the ceiling.
2. **Reserve → capture / release.** Credits are held before calling a provider and charged only when it succeeds. Balances can't go negative, and failed, cancelled or moderated generations cost the user nothing. Stale holds auto-release after 2 hours.
3. **Use-it-or-lose-it allowances.** Monthly credits expire at the end of the period, and yearly subscribers get credits monthly (so annual buyers can't front-load AI spend). Pack credits last 12 months and are spent after monthly credits.
4. **Abuse limits per plan.** A cap on concurrent generations and a daily credit spend cap.
5. **Real cost tracking.** Each `AiGeneration` can record `providerCostUsd`. Compare it with `estimatedCostUsd` from provider invoices and re-price actions as provider prices change.

## Credit prices (current estimates)

| Action                          | Est. provider cost    | Credits         |
| ------------------------------- | --------------------- | --------------- |
| Caption + hook (3 variants)     | $0.004                | 1               |
| Hashtag set                     | $0.002                | 1               |
| Repurpose for each platform     | $0.01                 | 2               |
| Email draft                     | $0.01                 | 2               |
| Weekly content plan             | $0.03                 | 6               |
| Image (OpenAI standard / HD)    | $0.05 / $0.17         | 10 / 34         |
| Image (Higgsfield 720p / 1080p) | $0.06 / $0.10         | 12 / 20         |
| Video 5s / 10s / 15s (720p)     | $0.50 / $1.00 / $1.50 | 100 / 200 / 300 |
| AI analyst niche report         | $0.10                 | 20              |
| Performance insights            | $0.03                 | 6               |
| 100 emails over plan quota      | $0.05                 | 10              |

Video resolution multiplier: 480p ×0.75, 720p ×1, 1080p ×1.5.

**These cost estimates must be checked against your OpenAI and Higgsfield invoices before launch.**
