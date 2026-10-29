// DOCUMENTS: the server-pool assembly (extracted by responsibility,
// guard-file-size; the engine-stage6.js precedent — no behavior change, the
// same registration order on the live network). Stage 1 registers the
// single server answerable as 10.1; Stage 2 wires the LB in front of two
// duplicated backends; Stage 3 attaches the shared cache-aside Cache to
// both backends; Stage 4 adds the primary/replica Database; Stage 5 adds
// the WorkerQueue & Worker. An optional fault consult rides the components
// themselves: down flags on the servers, the bypass flag on the shared
// cache.
import { createWebServer } from './webserver.js';
import { createLoadBalancer } from './loadbalancer.js';

export function createServerPool({
  stage,
  serverAddress,
  serviceRate,
  backendAddresses,
  cache,
  database,
  workerQueue,
  network,
}) {
  if (stage === 1) {
    const server = createWebServer({ address: serverAddress, serviceRate });
    network.registerServer(serverAddress, server);
    return { servers: [server], lb: null };
  }
  const servers = backendAddresses.map((addr) =>
    createWebServer({ address: addr, serviceRate, cache, database, workerQueue }),
  );
  for (const s of servers) network.registerServer(s.address, s);
  const lb = createLoadBalancer({ address: serverAddress, backends: backendAddresses, network });
  network.registerServer(serverAddress, lb);
  return { servers, lb };
}
