// DOCUMENTS: N simulated users — each tick, each user emits at most one
// request with probability `arrivalProb`, drawn from the engine's seeded
// RNG (passed in; this module holds no randomness of its own, so count
// changes stay inside the deterministic action sequence).
export function createUsers({ count = 5 } = {}) {
  let n = count;
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`users: count must be a non-negative integer, got ${n}`);
  }
  return {
    setCount(next) {
      if (!Number.isInteger(next) || next < 0) {
        throw new Error(`users: count must be a non-negative integer, got ${next}`);
      }
      n = next;
    },
    getCount() {
      return n;
    },
    step(rng, arrivalProb) {
      const requests = [];
      for (let i = 0; i < n; i++) {
        if (rng() < arrivalProb) requests.push({ userId: i });
      }
      return requests;
    },
  };
}
