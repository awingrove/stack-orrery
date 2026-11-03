import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPONENT_SOURCE, EXCERPT_NOTE } from '../../js/panel/inspector-source.js';
import { STAGE6_SOURCE } from '../../js/panel/inspector-source-stage6.js';

// DOCUMENTS: structural parity pins for the inspector's hand-edited code
// mirrors (full-review finding 5-01): the maps must line up with the
// components formatComponentState / componentTitle support, every `file`
// must resolve to a real js/sim module on disk, every `code` excerpt must
// open with the factory it claims to mirror, and the honest-excerpt marker
// must ride every entry (rendered as EXCERPT_NOTE + file by render.js).
const SELECTABLE_COMPONENTS = [
  'browser',
  'network',
  'loadbalancer',
  'webserver',
  'cache',
  'database',
  'workerqueue',
  'dns',
  'router',
  'cdn',
];
const STAGE6_COMPONENTS = ['dns', 'router', 'cdn'];
const FACTORY_BY_KEY = {
  browser: 'createBrowser',
  network: 'createNetwork',
  loadbalancer: 'createLoadBalancer',
  webserver: 'createWebServer',
  cache: 'createCache',
  database: 'createDatabase',
  workerqueue: 'createWorkerQueue',
  dns: 'createDns',
  router: 'createRouter',
  cdn: 'createCdnEdge',
};

function pinsFor(source, selectable) {
  // PINS: key-set parity, order-insensitive — the spread order (stage-6
  // entries first) is an implementation detail, the membership is not.
  it(`keys deep-equal the ${selectable.length} selectable components`, () => {
    expect(Object.keys(source).sort()).toEqual([...selectable].sort());
  });

  it("every entry's file resolves on disk", () => {
    for (const [key, entry] of Object.entries(source)) {
      expect(existsSync(resolve(entry.file)), `${key} -> ${entry.file}`).toBe(true);
    }
  });

  it('every code string is non-empty and opens with its own create* factory', () => {
    for (const [key, entry] of Object.entries(source)) {
      const factory = entry.code.trim().match(/^create[A-Za-z]*/)?.[0] ?? '';
      expect(entry.code.trim(), `${key} code`).not.toBe('');
      expect(factory, `${key} first meaningful token`).toBe(FACTORY_BY_KEY[key]);
    }
  });

  it('EXCERPT_NOTE is non-empty and every entry carries excerpt: true', () => {
    expect(EXCERPT_NOTE.trim().length).toBeGreaterThan(0);
    for (const [key, entry] of Object.entries(source)) {
      expect(entry.excerpt, `${key} excerpt marker`).toBe(true);
    }
  });
}

describe('the inspector mirrors carry honest labels and resolvable sources — every entry names a real js/sim file, every code string names its factory, and the excerpt notice rides every panel', () => {
  describe('COMPONENT_SOURCE', () => {
    pinsFor(COMPONENT_SOURCE, SELECTABLE_COMPONENTS);
  });

  describe('STAGE6_SOURCE', () => {
    pinsFor(STAGE6_SOURCE, STAGE6_COMPONENTS);
  });
});
