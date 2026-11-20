import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { User } from 'firebase/auth';
import { Camera, CheckCircle2, MapPin, ThumbsDown, ThumbsUp } from 'lucide-react';
import type {
  AQIResponse,
  CityPreset,
  CommunityReport,
  FiresResponse,
  ReportType,
} from '../types/env';
import { getAQICategoryInfo } from '../utils/aqi';

interface CommunityMapViewProps {
  selectedCity: CityPreset;
  aqi: AQIResponse | null;
  fires: FiresResponse | null;
  reports: CommunityReport[];
  user: User | null;
  onSubmitReport: (payload: {
    type: ReportType;
    description: string;
    city: string;
    latitude: number;
    longitude: number;
    photoDataUrl?: string;
  }) => Promise<void>;
  onVoteReport: (id: string, vote: 'up' | 'down') => Promise<void>;
}

const REPORT_TYPE_LABELS: Record<ReportType, { label: string; color: string }> = {
  smoke: { label: 'Smoke / Burning', color: '#DC2626' },
  dust: { label: 'Construction Dust', color: '#D97706' },
  traffic: { label: 'Traffic Congestion', color: '#EA580C' },
  industrial: { label: 'Industrial Emission', color: '#9333EA' },
  clean_zone: { label: 'Verified Clean Zone', color: '#16A34A' },
};

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const maxDim = 640;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const CommunityMapView: React.FC<CommunityMapViewProps> = ({
  selectedCity,
  aqi,
  fires,
  reports,
  onSubmitReport,
  onVoteReport,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [filter, setFilter] = useState<'all' | 'hazards' | 'clean_zone'>('all');
  const [reportType, setReportType] = useState<ReportType>('smoke');
  const [description, setDescription] = useState('');
  const [pinLat, setPinLat] = useState(selectedCity.latitude);
  const [pinLon, setPinLon] = useState(selectedCity.longitude);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setPinLat(selectedCity.latitude);
    setPinLon(selectedCity.longitude);
  }, [selectedCity.latitude, selectedCity.longitude]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [selectedCity.latitude, selectedCity.longitude],
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    map.on('click', (ev: L.LeafletMouseEvent) => {
      setPinLat(Number(ev.latlng.lat.toFixed(4)));
      setPinLon(Number(ev.latlng.lng.toFixed(4)));
    });

    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Re-center when city changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([selectedCity.latitude, selectedCity.longitude], 11);
    }
  }, [selectedCity.latitude, selectedCity.longitude]);

  // Sync markers (AQI stations, heatmap circle, NASA fires, community reports, selected pin)
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    // City AQI radial zone
    if (aqi) {
      const cat = getAQICategoryInfo(aqi.aqi);
      L.circle([aqi.latitude, aqi.longitude], {
        radius: 6500,
        color: cat.hex,
        fillColor: cat.hex,
        fillOpacity: 0.16,
        weight: 1.5,
      })
        .bindPopup(
          `<strong>${aqi.location}</strong><br/>AQI: ${aqi.aqi} (${cat.category})<br/>Source: ${aqi.source}`,
        )
        .addTo(group);

      (aqi.stations || []).forEach((st) => {
        const stCat = getAQICategoryInfo(st.aqi);
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${stCat.hex};color:#fff;font-family:monospace;font-weight:700;font-size:11px;padding:3px 7px;border-radius:6px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">AQI ${st.aqi}</div>`,
          iconSize: [58, 24],
          iconAnchor: [29, 12],
        });
        L.marker([st.latitude, st.longitude], { icon })
          .bindPopup(`<strong>${st.name}</strong><br/>AQI ${st.aqi} · ${st.source}`)
          .addTo(group);
      });
    }

    // NASA Fire alerts
    (fires?.alerts || []).forEach((f) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#EA580C;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;border:2px solid #fff;white-space:nowrap;">FIRE ${f.distanceKm}km</div>`,
        iconSize: [68, 22],
        iconAnchor: [34, 11],
      });
      L.marker([f.latitude, f.longitude], { icon })
        .bindPopup(`<strong>${f.title}</strong><br/>${f.source} · ${f.distanceKm} km away`)
        .addTo(group);
    });

    // Community reports
    reports.forEach((rep) => {
      const meta = REPORT_TYPE_LABELS[rep.type];
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${meta.color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([rep.latitude, rep.longitude], { icon })
        .bindPopup(
          `<strong>${meta.label}</strong> (${rep.city})<br/>${rep.description}<br/>Votes: +${rep.upvotes} / -${rep.downvotes}`,
        )
        .addTo(group);
    });

    // Selected submission pin (anchored above coordinate so station badge stays readable)
    const pinIcon = L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;"><div style="background:#0F172A;color:#5EEAD4;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;border:1.5px solid #5EEAD4;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,0.35);">Pin</div><div style="width:2px;height:10px;background:#0F172A;"></div></div>`,
      iconSize: [34, 30],
      iconAnchor: [17, 30],
    });
    L.marker([pinLat, pinLon], { icon: pinIcon, zIndexOffset: 800 }).addTo(group);
  }, [aqi, fires, reports, pinLat, pinLon]);

  const filteredReports = reports.filter((r) => {
    if (filter === 'clean_zone') return r.type === 'clean_zone';
    if (filter === 'hazards') return r.type !== 'clean_zone';
    return true;
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoDataUrl(compressed);
    } catch {
      setFeedback('Could not compress image; please try a smaller JPEG/PNG.');
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 5) {
      setFeedback('Please describe the environmental observation in at least 5 characters.');
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await onSubmitReport({
        type: reportType,
        description: description.trim(),
        city: selectedCity.name,
        latitude: pinLat,
        longitude: pinLon,
        photoDataUrl,
      });
      setDescription('');
      setPhotoDataUrl(undefined);
      setFeedback('Community report published to the live map.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Map */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Live Environmental &amp; Clean-Zone Map · {selectedCity.name}
              </h2>
              <p className="text-xs text-slate-500">
                Click anywhere on the map to place your report pin ({pinLat}, {pinLon}). Source:
                OpenStreetMap + NASA + Community
              </p>
            </div>
          </div>
          <div
            ref={mapContainerRef}
            data-testid="community-leaflet-map"
            className="w-full h-[460px] z-0"
          />
        </div>

        {/* Submission Form */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-600" aria-hidden="true" />
            Submit Local Air Quality Report
          </h2>

          <form onSubmit={handleCreateReport} className="space-y-4">
            <div>
              <label
                htmlFor="report-type"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Incident or Safe Zone Category
              </label>
              <select
                id="report-type"
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              >
                <option value="smoke">Smoke / Garbage Burning</option>
                <option value="dust">Construction / Road Dust</option>
                <option value="traffic">Severe Traffic Exhaust</option>
                <option value="industrial">Industrial Emission</option>
                <option value="clean_zone">Verified Clean-Air Park / Safe Zone</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="rep-lat"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Latitude
                </label>
                <input
                  id="rep-lat"
                  type="number"
                  step="0.0001"
                  value={pinLat}
                  onChange={(e) => setPinLat(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label
                  htmlFor="rep-lon"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Longitude
                </label>
                <input
                  id="rep-lon"
                  type="number"
                  step="0.0001"
                  value={pinLon}
                  onChange={(e) => setPinLon(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="report-desc"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Observation Details
              </label>
              <textarea
                id="report-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe smoke intensity, landmark, or park canopy conditions..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="report-photo"
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                Attach Compressed Photo (Optional)
              </label>
              <input
                id="report-photo"
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="sr-only"
              />
              {photoDataUrl && (
                <div className="mt-2">
                  <img
                    src={photoDataUrl}
                    alt="Compressed community report preview"
                    className="h-20 w-32 object-cover rounded-lg border border-slate-200"
                  />
                </div>
              )}
            </div>

            {feedback && (
              <p className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2.5">
                {feedback}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              {submitting ? 'Publishing Report...' : 'Publish Community Report'}
            </button>
          </form>
        </div>
      </div>

      {/* Reports Feed */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">
            Community Reports &amp; Safe Zones ({filteredReports.length})
          </h3>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { key: 'all', label: 'All Reports' },
              { key: 'hazards', label: 'Pollution Hazards' },
              { key: 'clean_zone', label: 'Clean Zones' },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key as 'all' | 'hazards' | 'clean_zone')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  filter === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredReports.map((rep) => {
            const meta = REPORT_TYPE_LABELS[rep.type];
            return (
              <div
                key={rep.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-bold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{rep.city}</span>
                    <span aria-hidden="true">·</span>
                    <span>by {rep.authorAlias}</span>
                    {rep.verified && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Community Verified
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-slate-800">{rep.description}</p>
                  {rep.photoDataUrl && (
                    <img
                      src={rep.photoDataUrl}
                      alt={`Report photo in ${rep.city}`}
                      className="mt-2 h-24 w-40 object-cover rounded-lg border border-slate-200"
                    />
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label={`Upvote report in ${rep.city}`}
                    onClick={() => onVoteReport(rep.id, 'up')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200 rounded-lg"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
                    {rep.upvotes}
                  </button>
                  <button
                    type="button"
                    aria-label={`Downvote report in ${rep.city}`}
                    onClick={() => onVoteReport(rep.id, 'down')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-slate-700 bg-slate-50 hover:bg-red-50 hover:text-red-800 border border-slate-200 rounded-lg"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
                    {rep.downvotes}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
