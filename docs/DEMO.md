# Seven-minute customer demo

Use `owner@dunav.demo.invalid` / `Demo1234!`. Keep the worker running. Say clearly that all government responses are simulated. The labels below use the Serbian Latin default; select EN or RU in the app header if that is easier for the audience.

1. **Minute 0–1:** Open **Operacije**. Point out the attention queue, explicit priority, and five compact counters. Open one of the first blocked shipments.
2. **Minute 1–2:** Choose a shipment with `UNIT_MAPPING_MISSING`. Open **Izmeni podatke**, map `kutija` to `KUT`, then **Proveri**. The issue closes and the shipment becomes ready.
3. **Minute 2–3:** **Pripremi dokument**, then **Pošalji**. Show queued, processing, and mock accepted states. Point to the `DEMO / MOCK` badge.
4. **Minute 3–4:** Open the eOtpremnica, events, raw data, and audit tabs. Show request ID, payload, XML, response, attempts, and correlation ID.
5. **Minute 4–5:** Open **Greške**. Select a failed transient request and **Pokušaj ponovo**. Show how retries are visible and audited. For a rejection, correct `SKU-DEMO-FAIL`, revalidate, prepare a new version, and send.
6. **Minute 5–6:** Open **Uvozi**. Upload `examples/imports/multiline_shipments.csv`, review the suggested Serbian Latin column mapping, save it as a template, and import three rows as two shipments. Open `MULTI-001` to show its two product lines.
7. **Minute 6–7:** Find `MULTI-001` in **Otpremnice**, validate it, and explain how the same process starts from existing ERP/Excel exports. Open **Integracije** to show the future direct ERP boundary and the explicit eOtpremnica mode.

On a repeat demo, change sample shipment numbers or reset the demo database, because external references are intentionally unique.
