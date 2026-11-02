// DOCUMENTS: the teachable constants — tick TTLs, replication lag, job
// duration, service rate. Sim factories default from this home and the
// panel's labels read the same home for their zero-state fallback, so a
// retint is one edit and one red-before-green test, not a grep hunt.
//
// CHECKS: the teaching contract — these are the numbers the panels
// narrate and the clients rely on (cache/cdn TTL 10, dns TTL 300,
// database lag 3, queue job duration 2, webserver service rate 4): one
// home, retint everywhere at once. The panel fallbacks keep the
// `?? DEFAULT` shape (1-02 vocabulary rule) because the sim's zero-state
// contract is unchanged — components are absent by stage — and the
// fallback that shows when they are absent reads the same home.
export const DEFAULT_TTL_TICKS = 10;
export const DEFAULT_DNS_TTL_TICKS = 300;
export const DEFAULT_REPLICATION_LAG_TICKS = 3;
export const DEFAULT_JOB_DURATION_TICKS = 2;
export const DEFAULT_SERVICE_RATE = 4;
