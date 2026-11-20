import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LANGUAGES, getRegionalHealthTip, t } from './i18n';
import type { LanguageCode } from '../types/env';

test('all 7 supported languages are listed with unique codes', () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 7);
  assert.equal(new Set(SUPPORTED_LANGUAGES.map((l) => l.code)).size, 7);
});

test('every language provides every English translation key', () => {
  const englishKeys = Object.keys(t('en')).sort();
  for (const { code } of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(t(code)).sort(), englishKeys, `${code} is missing keys`);
  }
});

test('no translation is empty and none mixes in a stray script by mistake', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    for (const [key, value] of Object.entries(t(code))) {
      assert.ok(String(value).trim().length > 0, `${code}.${key} is empty`);
    }
  }
  // Regression: a Devanagari vowel sign had slipped into a Gujarati string.
  assert.ok(!/[\u0A80-\u0AFF][\u093E-\u094C]/.test(t('gu').regionalTipTitle));
});

test('unknown language codes fall back to English', () => {
  assert.deepEqual(t('xx' as LanguageCode), t('en'));
});

test('regional tips exist for every language and city type', () => {
  for (const { code } of SUPPORTED_LANGUAGES) {
    for (const city of ['New Delhi', 'Mumbai', 'Bengaluru']) {
      assert.ok(getRegionalHealthTip(city, code).length > 10, `${code}/${city}`);
    }
  }
});
