# IR PA announcement style (appliance)

## Goal

Spoken announcements on the Ubuntu appliance should sound like Indian Railways station PA: formal Telugu → English → Hindi, clear digits, deliberate pacing — not conversational kiosk chat.

Voice engine on this product is **Piper** (offline). Do **not** clone official station PA recordings into the repo.

## Copy (templates)

Source of truth: [`edge/announce/defaults.js`](../edge/announce/defaults.js) `templates`.

Slot frame (all train events):

1. Attention (`యాత్రీకుల దయచేసి గమనించండి` / Attention please / यात्रियों कृपया ध्यान दें)
2. Train number digit-wise + official name
3. Route `{from}` → `{to}` when NTES provides them
4. Event (arriving / will depart / delayed by N minutes / …)
5. Platform number (digit-wise)

**Spoken numbers**

| Kind | Example | Spoken as |
|------|---------|-----------|
| Train / platform digits | `12789`, PF `2` | one two seven eight nine / two |
| Clock time | `3:15` | three fifteen (not three one five) |
| Delay / minutes | `15` | fifteen (cardinal, not digit-wise) |

Per-station overrides: Admin → **Announcement rules** → overlay  
`/etc/zasya/railway/overlays/{STATION}/announcements.json`.

Greetings / advisories / live mic stay free-form (`{extra}`); do not force the attention opener on greeting/advisory unless staff types it. Clock times in `{extra}` are expanded the same way.

## Voice (Piper)

| Language lane | Preference |
|---------------|------------|
| Telugu | Male `te_IN-venkatesh-medium` (slower `length_scale` ≈ 1.22; digits comma-paced) |
| Hindi | Male `hi_IN-pratham-medium` |
| English | Neutral `en_US-lessac-medium` (not Pratham — Hindi voice on English adds accent on train names) |

PA pacing (`edge/tts/engines/piper.js` profile `ir-pa-v5-platform-pause`):

- `length_scale` ≈ **1.08** EN/HI; Telugu ≈ **1.22** (override with `ZASYA_PIPER_LENGTH_SCALE` / `_TE`)
- `sentence_silence` ≈ **0.55** so train number / name do not merge into platform (override with `ZASYA_PIPER_SENTENCE_SILENCE`)
- Spoken text: train number and train name end with `.`; TE/HI also insert a pause before ప్లాట్‌ఫామ్ / प्लेटफॉर्म when overlays omit punctuation

Licensed talent / commercial voice brief if recording a custom Piper speaker later: formal public-address Telugu, mid pitch, even volume, clear digits, no trailing “uh”. Use Nampally only as a **style** reference.

## Validation checklist (Telugu listen test)

- [ ] Opens with యాత్రీకుల (not chatty “తర్వాతి రైలు…”)
- [ ] Train number spoken digit by digit
- [ ] Clock times as “three fifteen”, not digit-wise
- [ ] Hindi male (Pratham) for HI; neutral Lessac for EN; Venkatesh for TE
- [ ] Train names expanded (e.g. GOLCONDA EXP → Golconda Express)
- [ ] Platform phrased as ప్లాట్‌ఫామ్ నంబర్ + digits
- [ ] Delay always in minutes (60 not “1 hour”)
- [ ] Departing says will depart / బయలుదేరబోతోంది — never “has departed”
- [ ] Intelligible on laptop/UTM speakers and at arm’s length
- [ ] TE → EN → HI sequential, no overlap

## Related

- Customer requirements PDF + [`Railway_Announcement_Engine_Specification_v1.md`](./Railway_Announcement_Engine_Specification_v1.md)
- Digit / pause helpers: [`edge/announce/normalize.js`](../edge/announce/normalize.js)
