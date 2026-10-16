# stack-orrery

**Application architecture you can run, inspect, and understand.**

Stack Orrery is an **executable conceptual model** of an application stack —
a mechanical model you watch and inspect, not a static diagram you read. It
uses small, readable JavaScript components (`Browser`, `Network`,
`WebServer`, and as the stages grow: `DNS`, `LoadBalancer`, `Cache`,
`Database`, `WorkerQueue`, `Router`/`Bridge`) that exchange slimmed-down
but recognisable requests, responses, and queries (`"GET /about"` →
`"200 This is the about page"` over `<net>.<host>` mini-IPs like `10.1`).
Driven by a deterministic discrete tick loop, you can both follow a single
request's journey hop-by-hop and put the stack under load so that queue
depth climbing and latency rising are _visible_ in motion.

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
