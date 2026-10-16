// DOCUMENTS: a simulated browser — builds slim HTTP requests ("GET /path"),
// parses slim responses ("<status> <body>"), and sends them across the
// network to a target mini-IP. The newest displayed exchange is kept as
// inspectable state (`last()`), the way a browser keeps a rendered page.
//
// CHECKS: the constructor rejects an address that is not a two-number
// mini-IP (<net>.<host>) — fail-loud over silent mis-addressing.
export function createBrowser({ name = 'Browser-1', address = '10.2', network = null } = {}) {
  if (!/^\d+\.\d+$/.test(address)) {
    throw new Error(`browser: address must be <net>.<host>, got ${address}`);
  }
  let lastDisplay = null;

  return {
    get name() {
      return name;
    },
    get address() {
      return address;
    },

    // Slimmed-down HTTP: the stack rules cut every token that does not
    // earn a teaching place (AGENTS.md).
    createRequest(path = '/') {
      return `GET ${path}`;
    },

    parseResponse(raw) {
      const [statusToken, ...bodyParts] = String(raw).trim().split(' ');
      return { status: Number(statusToken), body: bodyParts.join(' ') };
    },

    get(targetAddress, path = '/') {
      if (!network) throw new Error('browser: no network attached');
      const request = this.createRequest(path);
      const { response } = network.send({ from: address, to: targetAddress, request });
      const { status, body } = this.parseResponse(response);
      lastDisplay = { from: address, to: targetAddress, request, response, status, body };
      return lastDisplay;
    },

    last() {
      return lastDisplay;
    },
  };
}
