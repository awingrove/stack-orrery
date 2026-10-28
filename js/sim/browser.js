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
    // earn a teaching place (AGENTS.md). The learner picks the method in
    // the mini-browser; GET stays the default for every crowd path.
    createRequest(path = '/', method = 'GET') {
      return `${method} ${path}`;
    },

    parseResponse(raw) {
      const [statusToken, ...bodyParts] = String(raw).trim().split(' ');
      return { status: Number(statusToken), body: bodyParts.join(' ') };
    },

    // Render an exchange that arrived as a wire record (the engine's
    // hop-by-hop trace delivers it here): parse and store as inspectable
    // viewport state.
    receiveResponse({ from, to, request, response }) {
      const { status, body } = this.parseResponse(response);
      lastDisplay = { from, to, request, response, status, body };
      return lastDisplay;
    },

    // Stage 6: an NX DNS answer is the "page" the browser renders — no GET
    // was ever emitted, so this is a resolver refusal card, not a response.
    receiveDnsFailure(request = 'GET /') {
      lastDisplay = {
        request,
        response: 'NX no record',
        status: 'NX',
        body: 'NX no record — no GET emitted',
      };
      return lastDisplay;
    },

    // B-6: a transport refusal is the page the browser shows for this
    // request — no HTTP exchange exists on the wire (response: null), so
    // this is a connection-refused error state, not a rendered "<status>
    // <body>" page.
    receiveRefusal(request = 'GET /', to = null) {
      lastDisplay = {
        request,
        response: null,
        to,
        status: 'REFUSED',
        body: 'connection refused — the browser shows its error page',
      };
      return lastDisplay;
    },

    get(targetAddress, path = '/', method = 'GET') {
      if (!network) throw new Error('browser: no network attached');
      const request = this.createRequest(path, method);
      const record = network.send({ from: address, to: targetAddress, request });
      // CHECKS: a refused send hands the browser its refusal card — the
      // null response is not parsed into an invented HTTP status.
      if (record.refused) return this.receiveRefusal(request, targetAddress);
      return this.receiveResponse({
        from: address,
        to: targetAddress,
        request,
        response: record.response,
      });
    },

    last() {
      return lastDisplay;
    },
  };
}
