import { describe, it, expect } from 'vitest';
import { createNetwork } from '../../js/sim/network.js';
import { createBrowser } from '../../js/sim/browser.js';
import { createWebServer } from '../../js/sim/webserver.js';

describe('createNetwork + createBrowser', () => {
  it('browser sends slim GET over network mini-IP and parses 200 and 404 responses', () => {
    const network = createNetwork();
    const server = createWebServer({ address: '10.1' });
    network.registerServer('10.1', server);
    const browser = createBrowser({ name: 'Browser-1', address: '10.2', network });

    const ok = browser.get('10.1', '/');
    expect(ok).toEqual({
      from: '10.2',
      to: '10.1',
      request: 'GET /',
      response: '200 Welcome to the home page',
      status: 200,
      body: 'Welcome to the home page',
    });
    expect(browser.last()).toEqual(ok);

    const miss = browser.get('10.1', '/missing');
    expect(miss.status).toBe(404);
    expect(miss.body).toBe('Page not found');

    // The network itself returns the raw wire record: request in, response out.
    expect(network.send({ from: '10.2', to: '10.1', request: 'GET /about' })).toEqual({
      from: '10.2',
      to: '10.1',
      request: 'GET /about',
      response: '200 This is the about page',
    });
  });

  it('network rejects invalid mini-IP addresses and unknown hosts', () => {
    const network = createNetwork();
    expect(() => network.registerServer('10.1.1', createWebServer())).toThrow(/mini-IP/);
    expect(() => network.resolve('10')).toThrow(/mini-IP address 10/);
    expect(() => network.resolve('10.1')).toThrow(/no server at 10\.1/);

    network.registerServer('10.1', createWebServer({ address: '10.1' }));
    expect(() => network.send({ from: '102.0.0', to: '10.1', request: 'GET /' })).toThrow(
      /mini-IP address 102\.0\.0/,
    );
    expect(() => network.send({ from: '10.2', to: '11.1', request: 'GET /' })).toThrow(
      /no server at 11\.1/,
    );
    expect(() =>
      network.deliverToQueue({ id: '1:1', from: 'x.y', to: '10.1', request: 'GET /', atTick: 1 }),
    ).toThrow(/mini-IP address x\.y/);
    expect(() =>
      network.deliverToQueue({ id: '1:1', from: '10.2', to: '12.1', request: 'GET /', atTick: 1 }),
    ).toThrow(/no server at 12\.1/);
  });

  it('browser without a network fails loud on get', () => {
    const browser = createBrowser({ address: '10.2' });
    expect(() => browser.get('10.1')).toThrow(/no network attached/);
  });

  it('browser rejects a non mini-IP address of its own', () => {
    expect(() => createBrowser({ address: '10.2.1' })).toThrow(/<net>\.<host>/);
  });
});
