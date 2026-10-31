// DOCUMENTS: shared helpers for the fault-console e2e specs (extracted by
// responsibility, guard-file-size — the panel-stage6.spec.js precedent for
// keeping a spec under its cap): the rail's faults tab, journey-log hop
// entries, cache entry rows, mission chips, and the hop-by-hop trace
// runner every B-6 slice drives. No test lives in this file; the specs
// import these.

export const faultsTab = (page) => page.getByTestId('rail-tab-faults');

export const journeyHop = (page, text) =>
  page.locator('.journey-log .journey-entry', { hasText: text });

export const cacheEntryRows = (page) =>
  page.getByTestId('cache-entries-list').locator('.route-item');

export const missionChip = (page, filterText) =>
  page.getByTestId('mission-item').filter({ hasText: filterText }).getByTestId('mission-status');

export const runHops = async (page, hops) => {
  for (let i = 0; i < hops; i += 1) await page.getByTestId('btn-next-hop').click();
};

// Selects the request method, fills the mini-browser URL, and runs the
// hop-by-hop trace to its final hop.
export const traceWith = async (page, { method = 'GET', path = '/about', hops }) => {
  await page.getByTestId('req-method').selectOption(method);
  await page.getByTestId('url-input').fill(path);
  await runHops(page, hops);
};
