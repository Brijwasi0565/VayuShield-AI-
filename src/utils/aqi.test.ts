import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDailyExposure,
  calculateIAQEffectiveness,
  calculateIndianAQI,
  getAQICategoryInfo,
  getVentilationWindowAdvice,
} from './aqi';

test('calculateIndianAQI returns accurate CPCB NAQI band values', () => {
  assert.equal(calculateIndianAQI({ pm25: 15, pm10: 25, no2: 20, o3: 25 }), 25);
  assert.equal(calculateIndianAQI({ pm25: 60, pm10: 90, no2: 40, o3: 50 }), 100);
  const severe = calculateIndianAQI({ pm25: 185, pm10: 280, no2: 65, o3: 45 });
  assert.ok(severe >= 301 && severe <= 400, `Expected 301-400, got ${severe}`);
});

test('getAQICategoryInfo flags emergency mode above 300', () => {
  assert.equal(getAQICategoryInfo(45).emergency, false);
  assert.equal(getAQICategoryInfo(180).category, 'Unhealthy for Sensitive Groups');
  assert.equal(getAQICategoryInfo(320).emergency, true);
  assert.equal(getAQICategoryInfo(430).category, 'Hazardous');
});

test('calculateDailyExposure computes exposure dose and risk level', () => {
  const low = calculateDailyExposure(30, 60);
  assert.equal(low.exposureUnits, 30);
  assert.equal(low.riskLevel, 'Low');

  const high = calculateDailyExposure(120, 220);
  assert.equal(high.exposureUnits, 440);
  assert.equal(high.riskLevel, 'High');
});

test('calculateIAQEffectiveness evaluates room ACH and indoor AQI drop', () => {
  const result = calculateIAQEffectiveness(150, 9, 300, 260);
  assert.ok(result.ach > 4.8, `Expected ACH > 4.8, got ${result.ach}`);
  assert.ok(
    result.estimatedIndoorAqi < 80,
    `Expected indoor AQI < 80, got ${result.estimatedIndoorAqi}`,
  );
  assert.ok(result.pm25ReductionPercent >= 70);
});

test('getVentilationWindowAdvice picks the lowest-AQI 2-hour window', () => {
  const hourly = [
    { time: '2026-11-19T06:00', aqi: 240, pm25: 120 },
    { time: '2026-11-19T07:00', aqi: 220, pm25: 110 },
    { time: '2026-11-19T14:00', aqi: 95, pm25: 45 },
    { time: '2026-11-19T15:00', aqi: 90, pm25: 42 },
  ];
  const advice = getVentilationWindowAdvice(hourly, 8);
  assert.equal(advice.bestWindowLabel, '14:00 – 15:00');
  assert.equal(advice.bestWindowAqi, 93);
  assert.equal(advice.shouldOpenWindowsNow, false);
});

test('haversineDistanceKm measures real city distances', async () => {
  const { haversineDistanceKm } = await import('./aqi');
  assert.equal(haversineDistanceKm(28.6139, 77.209, 28.6139, 77.209), 0);
  const delhiMumbai = haversineDistanceKm(28.6139, 77.209, 19.076, 72.8777);
  assert.ok(delhiMumbai > 1100 && delhiMumbai < 1200, `got ${delhiMumbai}`);
});

test('INDIAN_CITIES has valid coordinates inside India', async () => {
  const { INDIAN_CITIES } = await import('./aqi');
  assert.ok(INDIAN_CITIES.length >= 10);
  for (const c of INDIAN_CITIES) {
    assert.ok(c.latitude > 6 && c.latitude < 38, `${c.name} latitude`);
    assert.ok(c.longitude > 68 && c.longitude < 98, `${c.name} longitude`);
  }
});

test('calculateIndianAQI handles missing pollutant readings safely', () => {
  assert.equal(calculateIndianAQI({ pm25: null, pm10: null, no2: null, o3: null }), 0);
});
