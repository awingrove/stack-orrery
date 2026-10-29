// DOCUMENTS: the network — the wiring that lets two-number mini-IP
// addressable components exchange messages. Today it carries slim HTTP
// requests to a registered server; later stages attach more components
// without changing the send/enqueue contract.
//
// B-6 refusal choke point: BOTH entry points consult the resolved host's
// own down flag via isDown?.() BEFORE dispatch and hand the sender back a
// refusal record { from, to, request, response: null, refused: true } — no
// HTTP exchange exists on the wire, nothing is enqueued, and the host's
// methods are not consulted at all. Registered-but-down is refused, not
// thrown; an unregistered address fails loud as before. The count of
// refusals is kept here at the choke point and read back with
// refusedCount().
//
// CHECKS: every address crossing the wire is validated as a two-number
// mini-IP (<net>.<host>), and sends to unregistered hosts fail loud.
const MINI_IP = /^\d+\.\d+$/;

export function createNetwork() {
  const servers = new Map();
  let refusedCount = 0;

  function validate(addr) {
    if (!MINI_IP.test(addr)) {
      throw new Error(`network: invalid mini-IP address ${addr}`);
    }
  }

  function resolve(address) {
    validate(address);
    const server = servers.get(address);
    if (!server) {
      throw new Error(`network: no server at ${address}`);
    }
    return server;
  }

  // CHECKS: the one refusal shape both entry points return — the wire
  // record's own fields with no response and `refused: true`. A refusal is
  // component state (the host's down flag) consumed by real code paths, so
  // the sender narrates this record, not an invented HTTP status.
  function refusalOf({ from, to, request }) {
    refusedCount += 1;
    return { from, to, request, response: null, refused: true };
  }

  return {
    registerServer(address, server) {
      validate(address);
      servers.set(address, server);
    },

    resolve,

    // CHECKS: crowd and trace sends alike cross this single choke point —
    // the down host's handleRequest is not consulted while it is down.
    // B-6b: a handled host (the healthy LB) whose selection reached a
    // refused hop downstream returns the record it received as-is, so the
    // sender gets the same refusal shape without a second tally — the
    // count was taken where the refusal was recorded.
    send({ from, to, request }) {
      validate(from);
      const server = resolve(to);
      if (server.isDown?.()) return refusalOf({ from, to, request });
      const response = server.handleRequest(request);
      if (response?.refused === true) {
        return { from, to, request, response: null, refused: true };
      }
      return { from, to, request, response };
    },

    // `isYou` rides through untouched: the engine marks the learner's own
    // interactive-browser request, the server stores it on the queue row.
    // CHECKS: a refused delivery never reaches enqueue — a down host's
    // queue depth cannot grow from refusals (pinned in
    // test/sim/webserver-fault.test.js).
    deliverToQueue({ id, from, to, request, atTick, isYou = false }) {
      validate(from);
      const server = resolve(to);
      if (server.isDown?.()) return refusalOf({ from, to, request });
      server.enqueue({ id, from, to, request, atTick, isYou });
    },

    refusedCount() {
      return refusedCount;
    },
  };
}
