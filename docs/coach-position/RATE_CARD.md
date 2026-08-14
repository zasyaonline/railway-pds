# Coach Position — rate card (one page)

India. Chrome/Edge TVs. **No station PC.** One URL per screen: `?station=` + `?display=`. PDS and Coach on the **same physical screen** is **one device**.

**Architecture assumed:** TVs poll ~20 KB gzip JSON from CloudFront every 15s. NTES is fetched **once per station per 1–2 minutes** by the shared cloud poller — not per TV, not per Lambda hit. India CloudFront price class.

Do **not** quote ₹477 / device / month. That figure is a Lambda-per-TV model and is about **10×** real AWS.

---

## 1. Device licence (what the customer pays)

One fee per **physical screen**, regardless of PDS vs Coach vs both.

Recommended **list band for sales to confirm:** **₹200–400 / device / month** (₹2,400–4,800 / year). Covers product + margin. AWS must not dominate this number.

## 2. AWS (cost of goods)

| Scale | Per device / month | Fleet / year |
|---|---|---|
| ~30 screens | **₹25–50** | **₹10,000–20,000** |
| ~180 screens (30 stations × 6) | mostly CloudFront | **₹30,000–80,000** all-in |

Either **include** AWS in the licence or show it as a thin pass-through. It is not the commercial price.

## 3. 24×7 ops (optional add-on)

**Not** in the device fee. Default is business-hours watch.

Optional retainer: **₹25,000–50,000 / month** for fleet monitoring (board stale, NTES down, CloudFront 5xx, Slack/phone) with a stated ack target (e.g. 30 minutes). Per-incident or business-hours-only is cheaper. 24×7 on-call is this SKU.

---

## Quote example — 30 devices

- Licence: **₹6,000–12,000 / month**
- AWS: **₹750–1,500 / month**
- Ops: **₹0** or **₹25,000–50,000 / month**
