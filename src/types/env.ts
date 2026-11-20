export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'bn' | 'mr' | 'gu';

export type AgeGroup = 'infant' | 'child' | 'adult' | 'elderly';
export type HealthCondition = 'asthma' | 'copd' | 'allergies' | 'heart_disease' | 'pregnancy';
export type ActivityLevel = 'sedentary' | 'moderate' | 'active';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type PlannedActivity =
  'outdoor_exercise' | 'commute' | 'school_drop' | 'errands' | 'indoor_rest';

export interface CityPreset {
  name: string;
  state: string;
  region: 'north' | 'west' | 'south' | 'east' | 'central';
  latitude: number;
  longitude: number;
}

export interface PollutantReadings {
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  o3: number | null;
  so2?: number | null;
  co?: number | null;
}

export interface AQIForecastDay {
  date: string;
  aqi: number;
  category: string;
  pm25Max: number | null;
  pm10Max: number | null;
}

export interface AQIHourlyPoint {
  time: string;
  aqi: number;
  pm25: number | null;
}

export interface AQIResponse {
  location: string;
  latitude: number;
  longitude: number;
  aqi: number;
  category: string;
  pollutants: PollutantReadings;
  pollenStatus: string;
  source: string;
  fallbackUsed: boolean;
  timestamp: string;
  forecast: AQIForecastDay[];
  hourly: AQIHourlyPoint[];
  stations?: Array<{
    name: string;
    aqi: number;
    latitude: number;
    longitude: number;
    source: string;
  }>;
}

export interface WeatherForecastDay {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitationProb: number;
  windSpeedMax: number;
  weatherCode: number;
}

export interface WeatherResponse {
  latitude: number;
  longitude: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  uvIndex: number;
  weatherCode: number;
  conditionLabel: string;
  source: string;
  timestamp: string;
  forecast: WeatherForecastDay[];
}

export interface FireAlert {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  confidence: string;
  brightness?: number;
  timestamp: string;
  source: string;
  link?: string;
}

export interface FiresResponse {
  alerts: FireAlert[];
  nearbyCount: number;
  source: string;
  timestamp: string;
  firmsKeyConfigured: boolean;
}

export interface HouseholdMember {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  conditions: HealthCondition[];
  activityLevel: ActivityLevel;
}

export interface HouseholdProfile {
  id: string;
  userId?: string;
  name: string;
  location: string;
  latitude: number;
  longitude: number;
  members: HouseholdMember[];
  createdAt: string;
  updatedAt: string;
}

export interface RecommendationResult {
  overall: string;
  severityLevel: 'good' | 'moderate' | 'sensitive' | 'unhealthy' | 'very_unhealthy' | 'hazardous';
  outdoorGuidance: 'safe' | 'caution' | 'avoid';
  vulnerable: string[];
  indoor: string[];
  mask: string;
  ventilation: string;
  exercise: string;
  medication: string[];
  routineTips: string[];
  guidelinesCited: string[];
}

export type ReportType = 'smoke' | 'dust' | 'traffic' | 'industrial' | 'clean_zone';

export interface CommunityReport {
  id: string;
  authorId: string;
  authorAlias: string;
  type: ReportType;
  description: string;
  city: string;
  latitude: number;
  longitude: number;
  photoDataUrl?: string;
  upvotes: number;
  downvotes: number;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SymptomType =
  'cough' | 'breathlessness' | 'eye_irritation' | 'headache' | 'fatigue' | 'wheezing';

export interface SymptomLog {
  id: string;
  userId?: string;
  type: SymptomType;
  severity: 1 | 2 | 3 | 4 | 5;
  aqiAtTime: number;
  outdoorMinutes: number;
  medicationTaken?: string;
  notes?: string;
  createdAt: string;
}

export interface ChallengeItem {
  id: string;
  challengeKey: string;
  title: string;
  description: string;
  points: number;
  progress: number;
  target: number;
  completed: boolean;
  badgeName: string;
}
