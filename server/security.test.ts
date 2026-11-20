import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import {
  PRODUCTION_CSP,
  apiSecurityHeaders,
  clampNumber,
  createRateLimiter,
  isSafeImageDataUrl,
  parseCoordinates,
  productionSecurityHeaders,
  redactSecrets,
} from './security';

function fakeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return {
    res: res as unknown as Response,
    headers,
    get status() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
}

function fakeReq(ip = '1.1.1.1', path = '/api/x'): Request {
  return { ip, path, baseUrl: '', socket: { remoteAddress: ip } } as unknown as Request;
}

test('parseCoordinates accepts valid values and applies Delhi defaults when missing', () => {
  assert.deepEqual(parseCoordinates('19.07', '72.87'), { lat: 19.07, lon: 72.87 });
  assert.deepEqual(parseCoordinates(undefined, undefined), { lat: 28.6139, lon: 77.209 });
  assert.deepEqual(parseCoordinates('', ''), { lat: 28.6139, lon: 77.209 });
});

test('parseCoordinates rejects NaN, Infinity and out-of-range values', () => {
  assert.equal(parseCoordinates('abc', '77'), null);
  assert.equal(parseCoordinates('91', '77'), null);
  assert.equal(parseCoordinates('28', '181'), null);
  assert.equal(parseCoordinates('Infinity', '10'), null);
  assert.equal(parseCoordinates('-90.0001', '10'), null);
});

test('isSafeImageDataUrl allows raster images only', () => {
  assert.equal(isSafeImageDataUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeImageDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), false);
  assert.equal(isSafeImageDataUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(isSafeImageDataUrl('javascript:alert(1)'), false);
  assert.equal(isSafeImageDataUrl('https://evil.example/x.png'), false);
  assert.equal(isSafeImageDataUrl(`data:image/png;base64,${'A'.repeat(400_001)}`), false);
});

test('clampNumber bounds values and falls back for non-numbers', () => {
  assert.equal(clampNumber(50, 0, 100, 10), 50);
  assert.equal(clampNumber(-5, 0, 100, 10), 0);
  assert.equal(clampNumber(5000, 0, 100, 10), 100);
  assert.equal(clampNumber('nope', 0, 100, 10), 10);
  assert.equal(clampNumber(undefined, 0, 100, 10), 10);
});

test('redactSecrets hides Google API keys and token parameters from logs', () => {
  const fakeKey = 'AIza' + 'A'.repeat(35);
  const out = redactSecrets(`failed https://x.test/?key=${fakeKey}&token=abc123 plain ${fakeKey}`);
  assert.ok(!out.includes(fakeKey));
  assert.ok(!out.includes('abc123'));
  assert.ok(out.includes('[REDACTED'));
});

test('rate limiter blocks after the limit and sets Retry-After', () => {
  const limiter = createRateLimiter(60_000);
  const mw = limiter.middleware(2);
  let passed = 0;
  const next: NextFunction = () => {
    passed += 1;
  };
  mw(fakeReq(), fakeRes().res, next);
  mw(fakeReq(), fakeRes().res, next);
  const blocked = fakeRes();
  mw(fakeReq(), blocked.res, next);
  assert.equal(passed, 2);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) >= 1);
});

test('rate limiter tracks each IP separately', () => {
  const limiter = createRateLimiter(60_000);
  const mw = limiter.middleware(1);
  let passed = 0;
  const next: NextFunction = () => {
    passed += 1;
  };
  mw(fakeReq('1.1.1.1'), fakeRes().res, next);
  mw(fakeReq('2.2.2.2'), fakeRes().res, next);
  assert.equal(passed, 2);
});

test('rate limiter sweeps expired buckets so memory stays bounded', () => {
  const limiter = createRateLimiter(1_000);
  const mw = limiter.middleware(5);
  const next: NextFunction = () => undefined;
  for (let i = 0; i < 50; i += 1) mw(fakeReq(`10.0.0.${i}`), fakeRes().res, next);
  assert.equal(limiter.size(), 50);
  const removed = limiter.sweep(Date.now() + 5_000);
  assert.equal(removed, 50);
  assert.equal(limiter.size(), 0);
});

test('production headers include a strict CSP, nosniff and frame protection', () => {
  const r = fakeRes();
  let called = false;
  productionSecurityHeaders()(fakeReq(), r.res, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(r.headers['content-security-policy'], PRODUCTION_CSP);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.ok(PRODUCTION_CSP.includes("object-src 'none'"));
  assert.ok(PRODUCTION_CSP.includes("script-src 'self'"));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(PRODUCTION_CSP));
  assert.ok(!/script-src[^;]*unsafe-eval/.test(PRODUCTION_CSP));
});

test('API headers disable caching of responses', () => {
  const r = fakeRes();
  apiSecurityHeaders()(fakeReq(), r.res, () => undefined);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});
