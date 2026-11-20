import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Security helpers for the VayuShield API server.
 * Kept free of side effects so every function can be unit tested.
 */

/** Content-Security-Policy for the production build (served from the same origin). */
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  // Leaflet and React apply inline style attributes, so 'unsafe-inline' is needed for styles only.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  // Firebase (optional cloud sync) and Google Calendar (optional sync).
  [
    "connect-src 'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://firestore.googleapis.com',
  ].join(' '),
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ');

/** Adds hardening headers to every production response. */
export function productionSecurityHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', PRODUCTION_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

/** Headers that are always safe to send on API responses (also in development). */
export function apiSecurityHeaders(): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  middleware: (maxPerMinute: number) => RequestHandler;
  /** Removes expired buckets. Returns how many were removed. */
  sweep: (now?: number) => number;
  size: () => number;
}

/**
 * Per-IP fixed-window rate limiter. Expired buckets are removed so memory
 * cannot grow without bound (the previous version never cleaned up).
 */
export function createRateLimiter(windowMs = 60_000, maxBuckets = 10_000): RateLimiter {
  const buckets = new Map<string, Bucket>();

  const sweep = (now = Date.now()): number => {
    let removed = 0;
    for (const [key, bucket] of buckets) {
      if (now > bucket.resetAt) {
        buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  };

  const middleware =
    (maxPerMinute: number): RequestHandler =>
    (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${ip}:${req.baseUrl}${req.path}:${maxPerMinute}`;

      if (buckets.size >= maxBuckets) sweep(now);

      const bucket = buckets.get(key);
      if (!bucket || now > bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (bucket.count >= maxPerMinute) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
        res.status(429).json({
          error: 'Rate limit exceeded. Please wait a moment before trying again.',
        });
        return;
      }
      bucket.count += 1;
      return next();
    };

  return { middleware, sweep, size: () => buckets.size };
}

export interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Parses latitude/longitude from query values. Returns null when they are
 * missing-but-invalid, not numeric, or outside the valid range.
 * Missing values fall back to the supplied defaults (New Delhi).
 */
export function parseCoordinates(
  rawLat: unknown,
  rawLon: unknown,
  defaults: Coordinates = { lat: 28.6139, lon: 77.209 },
): Coordinates | null {
  const lat = rawLat === undefined || rawLat === '' ? defaults.lat : Number(rawLat);
  const lon = rawLon === undefined || rawLon === '' ? defaults.lon : Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Only raster images are accepted for community report photos. SVG and any
 * other type are rejected because they can carry scripts.
 */
export function isSafeImageDataUrl(value: string): boolean {
  return value.length <= 400_000 && IMAGE_DATA_URL.test(value);
}

/** Removes anything that looks like a secret from text before it is logged. */
export function redactSecrets(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/(token|key|secret|password)=([^&\s]+)/gi, '$1=[REDACTED]');
}

/** Clamps a number into [min, max]; returns fallback for non-finite input. */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
