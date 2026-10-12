# stack-orrery

A runnable **orrery of a web stack** — a mechanical model you watch, not a
diagram you read. Simulated users, a simulated web server, and (as the
stages grow) load balancers, caches, databases, and queues, all driven by a
deterministic discrete tick loop so that overload is *visible*: queue depth
climbs, latency rises, and the numbers stay stable enough to assert on.

Content follows the
[system-design-primer](https://github.com/donnemartin/system-design-primer)'s
scaling ladder as story stages: single server → duplicated servers +
round-robin LB → cache (TTL, stampede) → DB + replication → async queue +
workers → CDN / multi-region / failure injection. Each stage adds one
component and one failure mode.

## Run it

```bash
npm install
npx playwright install chromium   # once, for e2e
npm run serve                     # http://127.0.0.1:4173
npm run verify                    # the full gate: format → lint → unit → guard → e2e
```

Static, no build step, zero runtime dependencies — vanilla ESM in the
browser, devDeps for the gates.

## Status

Phase 1 bootstrap: app shell, simulator core, and the first diagram panel
(one simulated web server under N simulated users). Built by an AI-executed
factory — process contract in
[factory-kit](https://github.com/awingrove/factory-kit), instantiated here
in [FACTORY.md](FACTORY.md); work driven by committed briefs in
`docs/plans/`.

## License

MIT — see [LICENSE](LICENSE).
