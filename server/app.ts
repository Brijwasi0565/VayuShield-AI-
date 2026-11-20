import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import {
  INDIAN_CITIES,
  calculateIndianAQI,
  getAQICategoryInfo,
  haversineDistanceKm,
} from '../src/utils/aqi';
import { generateDeterministicRecommendations } from '../src/utils/recommendations';
import {
  apiSecurityHeaders,
  clampNumber,
  createRateLimiter,
  isSafeImageDataUrl,
  parseCoordinates,
  redactSecrets,
} from './security';
import type {
  AQIForecastDay,
  AQIHourlyPoint,
  AQIResponse,
  CommunityReport,
  FireAlert,
  FiresResponse,
  WeatherResponse,
} from '../src/types/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Server-side Gemini client (free-tier compatible models + required User-Agent header)
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// TTL Cache with stale-while-revalidate support
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
  ttlMs: number;
}
const apiCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): { entry: CacheEntry<T>; isFresh: boolean } | null {
  const raw = apiCache.get(key) as CacheEntry<T> | undefined;
  if (!raw) return null;
  const isFresh = Date.now() - raw.fetchedAt < raw.ttlMs;
  return { entry: raw, isFresh };
}

function setCached<T>(key: string, data: T, ttlMs: number) {
  apiCache.set(key, { data, fetchedAt: Date.now(), ttlMs });
}

const limiter = createRateLimiter();
const rateLimit = limiter.middleware;

// WMO weather code mapping
function weatherCodeToLabel(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code <= 3) return 'Partly Cloudy';
  if (code === 45 || code === 48) return 'Haze / Fog';
  if (code <= 57) return 'Light Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow / Hail';
  if (code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Overcast';
}

// Community reports lightweight JSON store (persisted across restarts)
const DATA_DIR = path.resolve(process.env.VAYU_DATA_DIR || path.join(PROJECT_ROOT, '.data'));
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

const SEED_REPORTS: CommunityReport[] = [
  {
    id: 'seed-delhi-ito',
    authorId: 'community-sentinel-1',
    authorAlias: 'Ananya R.',
    type: 'traffic',
    description: 'Heavy morning diesel bus congestion near ITO intersection causing visible haze.',
    city: 'New Delhi',
    latitude: 28.6289,
    longitude: 77.241,
    upvotes: 14,
    downvotes: 1,
    verified: true,
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-delhi-lodhi',
    authorId: 'community-sentinel-2',
    authorAlias: 'Vikram S.',
    type: 'clean_zone',
    description:
      'Lodhi Gardens inner canopy paths noticeably cooler and calmer than outer ring road.',
    city: 'New Delhi',
    latitude: 28.5931,
    longitude: 77.2197,
    upvotes: 22,
    downvotes: 0,
    verified: true,
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-mumbai-bkc',
    authorId: 'community-sentinel-3',
    authorAlias: 'Meera K.',
    type: 'dust',
    description:
      'Metro utility excavation dust along Bandra-Kurla connector road; wear mask if walking.',
    city: 'Mumbai',
    latitude: 19.0653,
    longitude: 72.8682,
    upvotes: 9,
    downvotes: 1,
    verified: false,
    createdAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-blr-cubbon',
    authorId: 'community-sentinel-4',
    authorAlias: 'Karthik N.',
    type: 'clean_zone',
    description: 'Cubbon Park bamboo grove morning readings steady and clean after brief drizzle.',
    city: 'Bengaluru',
    latitude: 12.9763,
    longitude: 77.5929,
    upvotes: 19,
    downvotes: 0,
    verified: true,
    createdAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
  },
];

function loadReports(): CommunityReport[] {
  try {
    if (!fs.existsSync(REPORTS_FILE)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(REPORTS_FILE, JSON.stringify(SEED_REPORTS, null, 2));
      return [...SEED_REPORTS];
    }
    const raw = fs.readFileSync(REPORTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...SEED_REPORTS];
  } catch {
    return [...SEED_REPORTS];
  }
}

function saveReports(reports: CommunityReport[]) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports.slice(0, 200), null, 2));
  } catch (err) {
    console.error('Failed to persist community reports:', redactSecrets(String(err)));
  }
}

async function fetchRealAQI(lat: number, lon: number, city: string): Promise<AQIResponse> {
  const cacheKey = `aqi:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const cached = getCached<AQIResponse>(cacheKey);
  if (cached && cached.isFresh) {
    return cached.entry.data;
  }

  let fallbackUsed = false;
  let source = 'Open-Meteo Air Quality (CAMS Copernicus)';

  try {
    const omUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi` +
      `&hourly=pm10,pm2_5,nitrogen_dioxide,ozone,us_aqi&forecast_days=7&timezone=auto`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(omUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`Open-Meteo AQI HTTP ${resp.status}`);
    }
    const json = (await resp.json()) as {
      current?: {
        time?: string;
        pm2_5?: number | null;
        pm10?: number | null;
        nitrogen_dioxide?: number | null;
        ozone?: number | null;
        sulphur_dioxide?: number | null;
        carbon_monoxide?: number | null;
        us_aqi?: number | null;
      };
      hourly?: {
        time?: string[];
        pm2_5?: (number | null)[];
        pm10?: (number | null)[];
        us_aqi?: (number | null)[];
      };
    };

    const cur = json.current || {};
    const pollutants = {
      pm25: cur.pm2_5 !== undefined && cur.pm2_5 !== null ? Number(cur.pm2_5.toFixed(1)) : null,
      pm10: cur.pm10 !== undefined && cur.pm10 !== null ? Number(cur.pm10.toFixed(1)) : null,
      no2:
        cur.nitrogen_dioxide !== undefined && cur.nitrogen_dioxide !== null
          ? Number(cur.nitrogen_dioxide.toFixed(1))
          : null,
      o3: cur.ozone !== undefined && cur.ozone !== null ? Number(cur.ozone.toFixed(1)) : null,
      so2:
        cur.sulphur_dioxide !== undefined && cur.sulphur_dioxide !== null
          ? Number(cur.sulphur_dioxide.toFixed(1))
          : null,
      co:
        cur.carbon_monoxide !== undefined && cur.carbon_monoxide !== null
          ? Number(cur.carbon_monoxide.toFixed(1))
          : null,
    };

    const indianAqi = calculateIndianAQI(pollutants);
    const aqi = indianAqi > 0 ? indianAqi : Math.round(cur.us_aqi ?? 0);

    // Optional OpenAQ v3 station enrichment if key exists
    const stations: AQIResponse['stations'] = [
      {
        name: `${city} Central (CAMS Grid)`,
        aqi,
        latitude: lat,
        longitude: lon,
        source,
      },
    ];

    if (process.env.OPENAQ_API_KEY) {
      try {
        const oaqResp = await fetch(
          `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=25000&limit=5`,
          { headers: { 'X-API-Key': process.env.OPENAQ_API_KEY } },
        );
        if (oaqResp.ok) {
          const oaqJson = (await oaqResp.json()) as {
            results?: Array<{
              name?: string;
              coordinates?: { latitude?: number; longitude?: number };
            }>;
          };
          for (const st of oaqJson.results || []) {
            if (st.coordinates?.latitude && st.coordinates?.longitude && st.name) {
              stations.push({
                name: st.name,
                aqi,
                latitude: st.coordinates.latitude,
                longitude: st.coordinates.longitude,
                source: 'OpenAQ v3',
              });
            }
          }
        }
      } catch {
        // Non-fatal station enrichment
      }
    }

    // Build 7-day daily forecast from hourly points
    const times = json.hourly?.time || [];
    const pm25Arr = json.hourly?.pm2_5 || [];
    const pm10Arr = json.hourly?.pm10 || [];
    const usAqiArr = json.hourly?.us_aqi || [];

    const hourly: AQIHourlyPoint[] = [];
    const dailyMap = new Map<
      string,
      { pm25Max: number; pm10Max: number; aqiSum: number; count: number }
    >();

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      const p25 = pm25Arr[i] ?? null;
      const p10 = pm10Arr[i] ?? null;
      const ind = calculateIndianAQI({ pm25: p25, pm10: p10, no2: null, o3: null });
      const ptAqi = ind > 0 ? ind : Math.round(usAqiArr[i] ?? aqi);

      if (i < 48) {
        hourly.push({ time: t, aqi: ptAqi, pm25: p25 });
      }
      const dayKey = t.slice(0, 10);
      const bucket = dailyMap.get(dayKey) || { pm25Max: 0, pm10Max: 0, aqiSum: 0, count: 0 };
      if (p25 !== null && p25 > bucket.pm25Max) bucket.pm25Max = p25;
      if (p10 !== null && p10 > bucket.pm10Max) bucket.pm10Max = p10;
      bucket.aqiSum += ptAqi;
      bucket.count += 1;
      dailyMap.set(dayKey, bucket);
    }

    const forecast: AQIForecastDay[] = Array.from(dailyMap.entries())
      .slice(0, 7)
      .map(([date, d]) => {
        const dayAqi = Math.round(d.aqiSum / Math.max(1, d.count));
        return {
          date,
          aqi: dayAqi,
          category: getAQICategoryInfo(dayAqi).category,
          pm25Max: Number(d.pm25Max.toFixed(1)),
          pm10Max: Number(d.pm10Max.toFixed(1)),
        };
      });

    const catInfo = getAQICategoryInfo(aqi);
    const result: AQIResponse = {
      location: city,
      latitude: lat,
      longitude: lon,
      aqi,
      category: catInfo.category,
      pollutants,
      pollenStatus: 'Coming Soon (Indian regional pollen network integration in progress)',
      source,
      fallbackUsed,
      timestamp: new Date().toISOString(),
      forecast,
      hourly,
      stations,
    };

    setCached(cacheKey, result, 30 * 60 * 1000);
    return result;
  } catch (primaryErr) {
    // Fallback 1: WAQI API if configured
    if (process.env.WAQI_API_KEY) {
      try {
        const waqiRes = await fetch(
          `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${process.env.WAQI_API_KEY}`,
        );
        if (waqiRes.ok) {
          const waqiJson = (await waqiRes.json()) as {
            status?: string;
            data?: {
              aqi?: number;
              iaqi?: Record<string, { v?: number }>;
              time?: { iso?: string };
            };
          };
          if (waqiJson.status === 'ok' && waqiJson.data?.aqi) {
            fallbackUsed = true;
            source = 'WAQI Fallback Feed';
            const aqi = Number(waqiJson.data.aqi);
            const result: AQIResponse = {
              location: city,
              latitude: lat,
              longitude: lon,
              aqi,
              category: getAQICategoryInfo(aqi).category,
              pollutants: {
                pm25: waqiJson.data.iaqi?.pm25?.v ?? null,
                pm10: waqiJson.data.iaqi?.pm10?.v ?? null,
                no2: waqiJson.data.iaqi?.no2?.v ?? null,
                o3: waqiJson.data.iaqi?.o3?.v ?? null,
              },
              pollenStatus: 'Coming Soon',
              source,
              fallbackUsed,
              timestamp: waqiJson.data.time?.iso || new Date().toISOString(),
              forecast: [],
              hourly: [],
            };
            setCached(cacheKey, result, 30 * 60 * 1000);
            return result;
          }
        }
      } catch {
        // Proceed to stale cache fallback
      }
    }

    // Fallback 2: Stale cached reading
    if (cached) {
      return {
        ...cached.entry.data,
        fallbackUsed: true,
        source: `${cached.entry.data.source} (Stale Cache)`,
      };
    }

    throw primaryErr;
  }
}

async function fetchRealWeather(lat: number, lon: number): Promise<WeatherResponse> {
  const cacheKey = `weather:${lat.toFixed(2)}:${lon.toFixed(2)}`;
  const cached = getCached<WeatherResponse>(cacheKey);
  if (cached && cached.isFresh) {
    return cached.entry.data;
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code,uv_index_max` +
      `&forecast_days=7&timezone=auto`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`Open-Meteo Weather HTTP ${resp.status}`);
    }

    const json = (await resp.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        weather_code?: number;
      };
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_probability_max?: number[];
        wind_speed_10m_max?: number[];
        weather_code?: number[];
        uv_index_max?: number[];
      };
    };

    const cur = json.current || {};
    const daily = json.daily || {};
    const weatherCode = cur.weather_code ?? 0;

    const forecast = (daily.time || []).slice(0, 7).map((date, idx) => ({
      date,
      tempMax: Math.round(daily.temperature_2m_max?.[idx] ?? 28),
      tempMin: Math.round(daily.temperature_2m_min?.[idx] ?? 18),
      precipitationProb: Math.round(daily.precipitation_probability_max?.[idx] ?? 0),
      windSpeedMax: Math.round(daily.wind_speed_10m_max?.[idx] ?? 10),
      weatherCode: daily.weather_code?.[idx] ?? 0,
    }));

    const result: WeatherResponse = {
      latitude: lat,
      longitude: lon,
      temperature: Number((cur.temperature_2m ?? 25).toFixed(1)),
      humidity: Math.round(cur.relative_humidity_2m ?? 50),
      windSpeed: Number((cur.wind_speed_10m ?? 8).toFixed(1)),
      windDirection: Math.round(cur.wind_direction_10m ?? 0),
      uvIndex: Number((daily.uv_index_max?.[0] ?? 5).toFixed(1)),
      weatherCode,
      conditionLabel: weatherCodeToLabel(weatherCode),
      source: 'Open-Meteo Weather API',
      timestamp: new Date().toISOString(),
      forecast,
    };

    setCached(cacheKey, result, 60 * 60 * 1000);
    return result;
  } catch (err) {
    if (cached) {
      return {
        ...cached.entry.data,
        source: `${cached.entry.data.source} (Cached)`,
      };
    }
    throw err;
  }
}

async function fetchRealFires(lat: number, lon: number): Promise<FiresResponse> {
  const cacheKey = `fires:${lat.toFixed(1)}:${lon.toFixed(1)}`;
  const cached = getCached<FiresResponse>(cacheKey);
  if (cached && cached.isFresh) {
    return cached.entry.data;
  }

  const firmsKey = process.env.NASA_FIRMS_API_KEY;
  const alerts: FireAlert[] = [];
  let source = 'NASA EONET Live Satellite';

  try {
    if (firmsKey) {
      const west = Math.max(-180, lon - 2.5).toFixed(2);
      const south = Math.max(-90, lat - 2.5).toFixed(2);
      const east = Math.min(180, lon + 2.5).toFixed(2);
      const north = Math.min(90, lat + 2.5).toFixed(2);
      const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${west},${south},${east},${north}/2`;
      const resp = await fetch(firmsUrl);
      if (resp.ok) {
        const csv = await resp.text();
        const lines = csv.trim().split('\n').slice(1, 30);
        lines.forEach((line, idx) => {
          const cols = line.split(',');
          const fLat = Number(cols[0]);
          const fLon = Number(cols[1]);
          const brightness = Number(cols[2]);
          const acqDate = cols[5] || new Date().toISOString().slice(0, 10);
          const confidence = cols[9] || 'nominal';
          if (!Number.isNaN(fLat) && !Number.isNaN(fLon)) {
            alerts.push({
              id: `firms-${idx}-${fLat.toFixed(2)}`,
              title: `VIIRS Thermal Hotspot (${brightness ? `${Math.round(brightness)}K` : 'Active'})`,
              latitude: fLat,
              longitude: fLon,
              distanceKm: haversineDistanceKm(lat, lon, fLat, fLon),
              confidence,
              brightness: Number.isNaN(brightness) ? undefined : brightness,
              timestamp: acqDate,
              source: 'NASA FIRMS VIIRS',
            });
          }
        });
        source = 'NASA FIRMS VIIRS_SNPP_NRT';
      }
    }

    // Always enrich / fallback with free key-less NASA EONET Wildfires API
    if (alerts.length === 0) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const eonetResp = await fetch(
        'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=40',
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (eonetResp.ok) {
        const eonetJson = (await eonetResp.json()) as {
          events?: Array<{
            id: string;
            title: string;
            link?: string;
            geometry?: Array<{ date?: string; coordinates?: [number, number] }>;
          }>;
        };
        for (const ev of eonetJson.events || []) {
          const geom = ev.geometry?.[ev.geometry.length - 1];
          const coords = geom?.coordinates;
          if (coords && coords.length >= 2) {
            const fLon = Number(coords[0]);
            const fLat = Number(coords[1]);
            const distanceKm = haversineDistanceKm(lat, lon, fLat, fLon);
            alerts.push({
              id: ev.id,
              title: ev.title,
              latitude: fLat,
              longitude: fLon,
              distanceKm,
              confidence: 'NASA Satellite Verified',
              timestamp: geom?.date || new Date().toISOString(),
              source: 'NASA EONET v3',
              link: ev.link,
            });
          }
        }
      }
    }

    alerts.sort((a, b) => a.distanceKm - b.distanceKm);
    const nearbyCount = alerts.filter((a) => a.distanceKm <= 150).length;

    const result: FiresResponse = {
      alerts: alerts.slice(0, 12),
      nearbyCount,
      source,
      timestamp: new Date().toISOString(),
      firmsKeyConfigured: Boolean(firmsKey),
    };
    setCached(cacheKey, result, 6 * 60 * 60 * 1000);
    return result;
  } catch (err) {
    if (cached) {
      return cached.entry.data;
    }
    throw err;
  }
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  // Set TRUST_PROXY=1 when running behind a reverse proxy so per-IP limits use the real client IP.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  app.use('/api', apiSecurityHeaders());
  // Small default body limit; only the audio upload route accepts a larger body.
  const defaultJson = express.json({ limit: '1mb' });
  const audioJson = express.json({ limit: '6mb' });
  app.use((req, res, next) =>
    req.path === '/api/ai/transcribe' ? next() : defaultJson(req, res, next),
  );

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // GET /api/aqi
  app.get('/api/aqi', rateLimit(120), async (req, res) => {
    const coords = parseCoordinates(req.query.lat, req.query.lon);
    const city = String(req.query.city || 'New Delhi').slice(0, 80);

    if (!coords) {
      return res.status(400).json({ error: 'Invalid latitude or longitude coordinates.' });
    }
    const { lat, lon } = coords;

    try {
      const data = await fetchRealAQI(lat, lon, city);
      return res.json(data);
    } catch (err) {
      console.error('AQI fetch failed:', redactSecrets(String(err)));
      return res.status(502).json({
        error: 'Unable to retrieve live AQI from Open-Meteo or fallback feeds.',
      });
    }
  });

  // GET /api/weather
  app.get('/api/weather', rateLimit(120), async (req, res) => {
    const coords = parseCoordinates(req.query.lat, req.query.lon);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }
    const { lat, lon } = coords;
    try {
      const data = await fetchRealWeather(lat, lon);
      return res.json(data);
    } catch (err) {
      console.error('Weather fetch failed:', redactSecrets(String(err)));
      return res.status(502).json({ error: 'Unable to fetch Open-Meteo weather data.' });
    }
  });

  // GET /api/fires
  app.get('/api/fires', rateLimit(60), async (req, res) => {
    const coords = parseCoordinates(req.query.lat, req.query.lon);
    if (!coords) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }
    const { lat, lon } = coords;
    try {
      const data = await fetchRealFires(lat, lon);
      return res.json(data);
    } catch (err) {
      console.error('Fire alerts fetch failed:', redactSecrets(String(err)));
      return res.status(502).json({ error: 'Unable to fetch NASA fire alert feed.' });
    }
  });

  // GET /api/geocode
  app.get('/api/geocode', rateLimit(60), async (req, res) => {
    const q = String(req.query.q || '')
      .trim()
      .slice(0, 100);
    if (q.length < 2) {
      return res.json({ results: INDIAN_CITIES.slice(0, 6) });
    }

    const cacheKey = `geo:${q.toLowerCase()}`;
    const cached = getCached<unknown[]>(cacheKey);
    if (cached && cached.isFresh) {
      return res.json({ results: cached.entry.data });
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=6&q=${encodeURIComponent(q)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'VayuShieldAI/1.0 (environmental-health-pwa)' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const raw = (await resp.json()) as Array<{
          display_name: string;
          lat: string;
          lon: string;
        }>;
        const mapped = raw.map((item) => ({
          name: item.display_name.split(',')[0].trim(),
          state: item.display_name.split(',').slice(1, 3).join(',').trim() || 'India',
          latitude: Number(item.lat),
          longitude: Number(item.lon),
          source: 'OpenStreetMap Nominatim',
        }));
        setCached(cacheKey, mapped, 24 * 60 * 60 * 1000);
        return res.json({ results: mapped });
      }
    } catch {
      // Fallback to local city catalog matching
    }

    const localMatches = INDIAN_CITIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.state.toLowerCase().includes(q.toLowerCase()),
    ).map((c) => ({ ...c, source: 'Indian Cities Directory' }));
    return res.json({ results: localMatches });
  });

  // POST /api/recommendations
  const recSchema = z.object({
    currentAQI: z.number().min(0).max(1000),
    timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).default('morning'),
    plannedActivity: z
      .enum(['outdoor_exercise', 'commute', 'school_drop', 'errands', 'indoor_rest'])
      .default('commute'),
    nearbyFireCount: z.number().min(0).max(500).optional(),
    members: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          ageGroup: z.enum(['infant', 'child', 'adult', 'elderly']),
          conditions: z.array(
            z.enum(['asthma', 'copd', 'allergies', 'heart_disease', 'pregnancy']),
          ),
          activityLevel: z.enum(['sedentary', 'moderate', 'active']),
        }),
      )
      .default([]),
  });

  app.post('/api/recommendations', rateLimit(120), (req, res) => {
    const parsed = recSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid recommendation input', details: parsed.error.issues });
    }
    const result = generateDeterministicRecommendations(parsed.data);
    return res.json(result);
  });

  // Community Reports REST endpoints (supports anonymous + signed-in users)
  app.get('/api/reports', rateLimit(120), (_req, res) => {
    const reports = loadReports();
    return res.json({ reports });
  });

  const reportSchema = z.object({
    type: z.enum(['smoke', 'dust', 'traffic', 'industrial', 'clean_zone']),
    description: z.string().trim().min(3).max(500),
    city: z.string().trim().min(1).max(80),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    authorAlias: z.string().trim().min(1).max(60).optional(),
    authorId: z.string().trim().max(128).optional(),
    photoDataUrl: z
      .string()
      .refine(isSafeImageDataUrl, 'Photo must be a PNG, JPEG, WebP or GIF image.')
      .optional(),
  });

  app.post('/api/reports', rateLimit(30), (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid report submission', details: parsed.error.issues });
    }
    const now = new Date().toISOString();
    const newReport: CommunityReport = {
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      authorId: parsed.data.authorId || 'anonymous-resident',
      authorAlias: parsed.data.authorAlias || 'Local Resident',
      type: parsed.data.type,
      description: parsed.data.description,
      city: parsed.data.city,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      photoDataUrl: parsed.data.photoDataUrl,
      upvotes: 1,
      downvotes: 0,
      verified: false,
      createdAt: now,
      updatedAt: now,
    };
    const reports = loadReports();
    reports.unshift(newReport);
    saveReports(reports);
    return res.status(201).json({ report: newReport });
  });

  app.post('/api/reports/:id/vote', rateLimit(60), (req, res) => {
    const id = req.params.id;
    const vote = req.body?.vote === 'down' ? 'down' : 'up';
    const reports = loadReports();
    const target = reports.find((r) => r.id === id);
    if (!target) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    if (vote === 'up') target.upvotes += 1;
    else target.downvotes += 1;
    target.verified = target.upvotes >= 5 && target.upvotes > target.downvotes * 2;
    target.updatedAt = new Date().toISOString();
    saveReports(reports);
    return res.json({ report: target });
  });

  // Gemini AI Chat / Grounding / Thinking / Low-Latency endpoint (free-tier models)
  const chatSchema = z.object({
    message: z.string().trim().min(1).max(3000),
    history: z
      .array(
        z.object({
          role: z.enum(['user', 'model']),
          text: z.string().max(4000),
        }),
      )
      .max(20)
      .default([]),
    mode: z.enum(['standard', 'fast', 'thinking', 'search', 'maps']).default('standard'),
    context: z
      .object({
        city: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        aqi: z.number().optional(),
        category: z.string().optional(),
        householdSummary: z.string().optional(),
      })
      .optional(),
  });

  app.post('/api/ai/chat', rateLimit(30), async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid AI request payload.' });
    }

    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured in server environment secrets.',
      });
    }

    const { message, history, mode, context } = parsed.data;
    const contextText = context
      ? `Current user context — City: ${context.city || 'New Delhi'}, Lat/Lon: ${context.latitude ?? 28.61},${context.longitude ?? 77.21}, Live AQI: ${context.aqi ?? 'Unknown'} (${context.category || 'N/A'}), Household: ${context.householdSummary || 'Standard adult'}.`
      : '';

    const systemInstruction =
      `You are VayuShield AI Environmental Health Advisor for India. ` +
      `Provide clear, calm, evidence-based explanations of air quality metrics, mask/purifier choices, and daily protective routines. ` +
      `IMPORTANT GUARDRAILS: Never override deterministic medical emergency warnings (AQI > 300 means stay indoors & seek medical help for acute breathing distress). ` +
      `Always keep answers practical for Indian households (mention N95/N99 standards, wet mopping, CPCB/WHO context when helpful). ` +
      contextText;

    try {
      if (mode === 'search') {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: message,
          config: {
            systemInstruction,
            tools: [{ googleSearch: {} }],
          },
        });
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const links = chunks
          .map((c: { web?: { uri?: string; title?: string } }) =>
            c.web?.uri ? { title: c.web.title || c.web.uri, uri: c.web.uri } : null,
          )
          .filter(Boolean);
        return res.json({
          reply: response.text || 'No response generated.',
          model: 'gemini-4-hydrogen (Google Search Grounded)',
          links,
        });
      }

      if (mode === 'maps') {
        const lat = context?.latitude ?? 28.6139;
        const lon = context?.longitude ?? 77.209;
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: message,
          config: {
            systemInstruction,
            tools: [{ googleMaps: {} }],
            toolConfig: {
              retrievalConfig: {
                latLng: { latitude: lat, longitude: lon },
              },
            },
          },
        });
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const links = chunks
          .map((c: { maps?: { uri?: string; title?: string } }) =>
            c.maps?.uri ? { title: c.maps.title || 'View on Google Maps', uri: c.maps.uri } : null,
          )
          .filter(Boolean);
        return res.json({
          reply: response.text || 'No places found.',
          model: 'gemini-4-hydrogen (Google Maps Grounded)',
          links,
        });
      }

      if (mode === 'fast') {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: [
            ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
            { role: 'user', parts: [{ text: message }] },
          ],
          config: {
            systemInstruction,
          },
        });
        return res.json({
          reply: response.text || 'No response generated.',
          model: 'gemini-3.1-flash-lite (Low Latency)',
          links: [],
        });
      }

      if (mode === 'thinking') {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [
            ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
            { role: 'user', parts: [{ text: message }] },
          ],
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          },
        });
        return res.json({
          reply: response.text || 'No response generated.',
          model: 'gemini-4-hydrogen (High Thinking)',
          links: [],
        });
      }

      // Standard multi-turn chat via ai.chats
      const chat = ai.chats.create({
        model: 'gemini-4-hydrogen',
        history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
        config: { systemInstruction },
      });
      const response = await chat.sendMessage({ message });
      return res.json({
        reply: response.text || 'No response generated.',
        model: 'gemini-4-hydrogen',
        links: [],
      });
    } catch (err) {
      console.error('Gemini chat error:', redactSecrets(String(err)));
      return res
        .status(502)
        .json({ error: 'The AI service is unavailable right now. Please try again.' });
    }
  });

  // Audio transcription via gemini-3.5-transcribe
  const transcribeSchema = z.object({
    audioBase64: z.string().min(10).max(6_000_000),
    mimeType: z.string().default('audio/webm'),
  });

  app.post('/api/ai/transcribe', rateLimit(20), audioJson, async (req, res) => {
    const parsed = transcribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid audio payload.' });
    }
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Gemini API key is not configured.' });
    }
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: parsed.data.mimeType,
                data: parsed.data.audioBase64,
              },
            },
            {
              text: 'Transcribe this audio accurately in English or the spoken Indian language.',
            },
          ],
        },
      });
      return res.json({
        transcript: (response.text || '').trim(),
        model: 'gemini-3.5-transcribe',
      });
    } catch (err) {
      console.error('Gemini transcribe error:', redactSecrets(String(err)));
      return res.status(502).json({ error: 'Audio transcription failed. Please try again.' });
    }
  });

  // Free Poster Copy Assistant via gemini-4-hydrogen
  app.post('/api/ai/poster-copy', rateLimit(20), async (req, res) => {
    const promptText = String(req.body?.prompt || 'Clean air protection for school children').slice(
      0,
      300,
    );
    const city = String(req.body?.city || 'New Delhi').slice(0, 60);
    const aqi = Math.round(clampNumber(req.body?.aqi, 0, 1000, 150));

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        headline: `Breathe Safer in ${city}`,
        subhead: `Current AQI ${aqi} · Practical Household Protection`,
        bullets: [
          'Wear a fitted N95 mask on high-traffic commutes',
          'Keep windows shut during peak morning smog hours',
          'Run HEPA filtration & wet-mop floors daily',
        ],
      });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create concise awareness poster copy for "${promptText}" in ${city} (AQI ${aqi}). Return JSON with fields: headline (max 6 words), subhead (max 10 words), bullets (array of 3 short 6-9 word action tips).`,
        config: {
          responseMimeType: 'application/json',
        },
      });
      const parsed = JSON.parse(response.text || '{}');
      return res.json({
        headline: parsed.headline || `Breathe Safer in ${city}`,
        subhead: parsed.subhead || `Live AQI ${aqi} · Community Action Guide`,
        bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 3) : [],
      });
    } catch {
      return res.json({
        headline: `Breathe Safer in ${city}`,
        subhead: `Live AQI ${aqi} · Community Action Guide`,
        bullets: [
          'Wear a fitted N95 respirator on busy roads',
          'Schedule outdoor errands during midday dispersion',
          'Protect children and seniors indoors when AQI spikes',
        ],
      });
    }
  });

  // Unknown API routes -> JSON 404 (never fall through to the SPA/HTML handler).
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // Central error handler: bad JSON, oversized bodies, anything unexpected.
  // Never leaks stack traces or internal messages.
  app.use(
    (
      err: Error & { status?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(err);
      if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body is too large.' });
      }
      if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Malformed JSON body.' });
      }
      console.error('Unhandled server error:', redactSecrets(String(err)));
      return res.status(500).json({ error: 'Internal server error.' });
    },
  );

  return app;
}
