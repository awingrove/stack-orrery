// DOCUMENTS: the left-network seat a browser uses to receive a wire
// response frame crossing BACK from subnet 20 (Stage 6b). The trace's
// traceHop registers the originating browser's seat in the engine before
// the trace runs; registration is idempotent per address and validates the
// mini-IP (fail-loud). The seat acknowledges the delivered frame without
// consuming it — the trace's finish hop performs the real browser render
// via onFinish, exactly as the stage-5 chain separates wire delivery from
// rendering. Additive and inert for stages 1-5 (no crossing ever targets
// them), which still fail loud on unregistered browser addresses.
const MINI_IP = /^\d+\.\d+$/;

export function createBrowserSeatRegistry(network) {
  const seats = new Set();
  return function ensureBrowserSeat(address) {
    if (seats.has(address)) return;
    if (!MINI_IP.test(address)) {
      throw new Error(`engine: invalid browser seat mini-IP ${address}`);
    }
    seats.add(address);
    network.registerServer(address, {
      handleRequest: (request) => `200 Browser seat ${address} (${request})`,
      enqueue: (frame) => frame,
    });
  };
}
