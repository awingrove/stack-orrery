// DOCUMENTS: the network — the wiring that lets two-number mini-IP
// addressable components exchange messages. Today it carries slim HTTP
// requests to a registered server; later stages attach more components
// without changing the send/enqueue contract.
//
// CHECKS: every address crossing the wire is validated as a two-number
// mini-IP (<net>.<host>), and sends to unregistered hosts fail loud.
const MINI_IP = /^\d+\.\d+$/;

export function createNetwork() {
  const servers = new Map();

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

  return {
    registerServer(address, server) {
      validate(address);
      servers.set(address, server);
    },

    resolve,

    send({ from, to, request }) {
      validate(from);
      const server = resolve(to);
      const response = server.handleRequest(request);
      return { from, to, request, response };
    },

    deliverToQueue({ id, from, to, request, atTick }) {
      validate(from);
      const server = resolve(to);
      server.enqueue({ id, from, to, request, atTick });
    },
  };
}
