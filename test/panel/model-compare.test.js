import { describe, it, expect } from 'vitest';
import { alignCompareRows, nextCompareSlots } from '../../js/panel/model.js';

// B-5 compare tray pure contracts: alignment over the longer run and the
// trace-runs-only slot branches. The named counter-examples from the brief
// are pinned here; the DOM side lives in e2e/compare.spec.js.
describe('compare tray model', () => {
  const runOf = (run, hops, textOf) => ({
    run,
    hops,
    label: `run ${run}`,
    entries: Array.from({ length: hops }, (_, i) => ({
      run,
      hop: i + 1,
      label: `hop ${i + 1}/${hops}`,
      text: textOf(i + 1),
    })),
  });

  it('unequal runs align over the longer side and pad the exhausted side with em-dashes', () => {
    const left = runOf(1, 9, (n) => `left frame ${n}`);
    const right = runOf(2, 6, (n) => `right frame ${n}`);
    const rows = alignCompareRows(left, right);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows.slice(0, 6).map((r) => r.right)).toEqual([
      'right frame 1',
      'right frame 2',
      'right frame 3',
      'right frame 4',
      'right frame 5',
      'right frame 6',
    ]);
    expect(rows.slice(6).map((r) => r.right)).toEqual(['—', '—', '—']);
    expect(rows.slice(6).map((r) => r.left)).toEqual([
      'left frame 7',
      'left frame 8',
      'left frame 9',
    ]);
  });

  it('equal runs align hop-for-hop with no em-dash padding', () => {
    const rows = alignCompareRows(
      runOf(1, 4, (n) => `l${n}`),
      runOf(2, 4, (n) => `r${n}`),
    );
    expect(rows).toEqual([
      { n: 1, left: 'l1', right: 'r1' },
      { n: 2, left: 'l2', right: 'r2' },
      { n: 3, left: 'l3', right: 'r3' },
      { n: 4, left: 'l4', right: 'r4' },
    ]);
  });

  it('alignment passes entry texts through byte-verbatim without mutating the entries', () => {
    const left = runOf(1, 3, (n) => `Browser (10.2) emits "GET /p${n}"`);
    const right = runOf(2, 2, (n) => `10.12 -> 10.2 | 200 page ${n}`);
    const leftCopy = structuredClone(left);
    const rightCopy = structuredClone(right);
    const rows = alignCompareRows(left, right);

    expect(rows.map((r) => r.left)).toEqual([
      'Browser (10.2) emits "GET /p1"',
      'Browser (10.2) emits "GET /p2"',
      'Browser (10.2) emits "GET /p3"',
    ]);
    expect(rows.slice(2).map((r) => r.right)).toEqual(['—']);
    expect(left).toEqual(leftCopy);
    expect(right).toEqual(rightCopy);
  });

  it('first push fills A then B, a third distinct run shifts A <- old B, B <- new', () => {
    const runA = {
      run: 1,
      label: 'a',
      hops: 4,
      entries: [
        { hop: 1, text: 'x' },
        { hop: 2, text: 'x2' },
      ],
    };
    const runB = {
      run: 2,
      label: 'b',
      hops: 4,
      entries: [
        { hop: 1, text: 'y' },
        { hop: 2, text: 'y2' },
      ],
    };
    const runC = {
      run: 3,
      label: 'c',
      hops: 4,
      entries: [
        { hop: 1, text: 'z' },
        { hop: 2, text: 'z2' },
      ],
    };

    let slots = nextCompareSlots({ a: null, b: null }, runA);
    expect(slots).toEqual({ a: runA, b: null, changed: true });

    slots = nextCompareSlots(slots, runB);
    expect(slots).toEqual({ a: runA, b: runB, changed: true });

    slots = nextCompareSlots(slots, runC);
    expect(slots).toEqual({ a: runB, b: runC, changed: true });
  });

  it('a repeat push of an already-stored run is a no-op, not a duplicate or a shift', () => {
    const runA = {
      run: 1,
      label: 'a',
      hops: 4,
      entries: [
        { hop: 1, text: 'x' },
        { hop: 2, text: 'x2' },
      ],
    };
    const runB = {
      run: 2,
      label: 'b',
      hops: 4,
      entries: [
        { hop: 1, text: 'y' },
        { hop: 2, text: 'y2' },
      ],
    };
    const slots = nextCompareSlots({ a: runA, b: runB }, runB);
    expect(slots).toEqual({ a: runA, b: runB, changed: false });
    // The left slot's run id applies too.
    expect(nextCompareSlots({ a: runA, b: runB }, runA)).toEqual({
      a: runA,
      b: runB,
      changed: false,
    });
  });

  it('a tick-shaped run (hops 0, no hop entries) is rejected — crowd ticks never enter the tray', () => {
    const stored = {
      run: 1,
      label: 'a',
      hops: 4,
      entries: [
        { hop: 1, text: 'x' },
        { hop: 2, text: 'x2' },
      ],
    };
    // Named counter-example: starting the crowd while a trace ran must not
    // shift the slots — a tick entry carries one entry (its lastFrame) with
    // hop 0, which the entries rule rejects outright.
    expect(nextCompareSlots({ a: stored, b: null }, { run: 9, hops: 0, entries: [] })).toEqual({
      a: stored,
      b: null,
      changed: false,
    });
    expect(
      nextCompareSlots({ a: null, b: null }, { run: 9, hops: 1, entries: [{ hop: 0, text: 't' }] }),
    ).toEqual({ a: null, b: null, changed: false });
    expect(nextCompareSlots({ a: null, b: null }, null)).toEqual({
      a: null,
      b: null,
      changed: false,
    });
  });

  it("alignment is driven by the entries' hop keys, not their array order", () => {
    // The model matches each row by entry.hop, so a caller passing
    // hop-scrambled entry arrays still aligns cells by hop position.
    const left = runOf(1, 3, (n) => `l${n}`);
    const right = {
      run: 2,
      hops: 3,
      label: 'r',
      entries: [3, 1, 2].map((hop) => ({ hop, text: `r${hop}` })),
    };
    expect(alignCompareRows(left, right).map((row) => row.right)).toEqual(['r1', 'r2', 'r3']);
  });
});
