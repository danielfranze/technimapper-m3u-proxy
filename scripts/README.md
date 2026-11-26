# Receiver probe scripts

Small, dependency-free (Node.js only) helpers to inspect a TechniSat receiver's
UPnP/ContentDirectory structure. Useful to capture new receiver generations
(STC, S, S1, S2, ...) and to verify that the fingerprint logic in
`lib/receiver.ts` (`detectSSeriesGeneration`) still matches.

## Usage

Probe full structure + detected model:

```bash
node scripts/probe-receiver.js <ip> [port]
```

Probe a single object with a custom RequestedCount (some firmware behaves
differently for 0 vs. N):

```bash
node scripts/probe-count.js <ip> [port] [objectId] [requestedCount]
```

Examples:

```bash
node scripts/probe-receiver.js 192.168.178.29
node scripts/probe-receiver.js 192.168.178.43 9100
node scripts/probe-count.js 192.168.178.43 9100 "3\$536870962" 100
```

## What to look for

- Top-level containers under object `3` (S-series) or `0$3$41` (STC).
- Presence/absence of `Astra-TV-Liste` (S1 vs. S2).
- Container count and titles for fingerprinting.
- `DETECTED MODEL` line confirms what `lib/receiver.ts` would return.

Captures should be reduced to mock fixtures in `test/receiver-s-series.test.ts`
(or a new test file) before committing, so the detection logic stays covered.
