import React, { useState } from 'react';
import { AlertTriangle, CheckSquare, Phone, ShieldAlert, Square, X } from 'lucide-react';
import type { FiresResponse } from '../types/env';

interface EmergencyModalProps {
  open: boolean;
  onClose: () => void;
  aqi: number;
  city: string;
  fires: FiresResponse | null;
  onFindShelters: () => void;
}

const CHECKLIST_ITEMS = [
  {
    id: 'seal',
    label: 'Seal all exterior windows, vents, and door gaps with damp towels or weatherstripping.',
  },
  {
    id: 'purifier',
    label:
      'Switch indoor HEPA air purifiers to High/Turbo mode inside the cleanest central bedroom.',
  },
  {
    id: 'masks',
    label: 'Keep certified N95 / N99 masks ready by the front door for every family member.',
  },
  {
    id: 'meds',
    label:
      'Stage rescue inhalers (salbutamol), nebulizer, prescribed cardiac meds, and saline nasal spray.',
  },
  {
    id: 'shelter',
    label: 'Identify nearest hospital respiratory wing or air-conditioned clean-air shelter.',
  },
];

export const EmergencyModal: React.FC<EmergencyModalProps> = ({
  open,
  onClose,
  aqi,
  city,
  fires,
  onFindShelters,
}) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  if (!open) return null;

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const completedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Emergency Air Quality Protocol"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-white border border-red-200 rounded-xl overflow-hidden my-auto">
        <div className="bg-red-700 text-white px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-bold leading-tight">
                Clean-Air Emergency Protocol · {city}
              </h2>
              <p className="text-xs text-red-100 mt-0.5">
                Current AQI: <span className="font-mono font-bold">{aqi}</span> · Nearby satellite
                fire alerts: <span className="font-mono font-bold">{fires?.nearbyCount ?? 0}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close emergency modal"
            onClick={onClose}
            className="p-2 rounded-lg text-red-100 hover:bg-red-800 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-950 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {aqi > 300
                  ? 'Hazardous Particulate Concentration (AQI > 300)'
                  : 'Emergency Preparedness & Nearby Fire Smoke Protocol'}
              </p>
              <p className="text-red-900 mt-1">
                Avoid all outdoor exertion. Vulnerable members (infants, elderly, asthma, COPD,
                cardiac patients) must remain in sealed, filtered indoor rooms until AQI drops below
                200.
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Immediate Household Safety Checklist
              </h3>
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                {completedCount}/{CHECKLIST_ITEMS.length} completed
              </span>
            </div>
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
              {CHECKLIST_ITEMS.map((item) => {
                const isDone = Boolean(checked[item.id]);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors"
                  >
                    {isDone ? (
                      <CheckSquare
                        className="w-5 h-5 text-teal-600 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    ) : (
                      <Square
                        className="w-5 h-5 text-slate-400 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`text-sm ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-4 space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Phone className="w-4 h-4 text-red-700" aria-hidden="true" />
                India Emergency Quick-Dial
              </h3>
              <div className="space-y-1.5 text-sm">
                <a
                  href="tel:112"
                  className="flex items-center justify-between py-1 text-slate-700 hover:text-red-700 font-medium"
                >
                  <span>National Emergency Helpline</span>
                  <span className="font-mono font-bold">112</span>
                </a>
                <a
                  href="tel:108"
                  className="flex items-center justify-between py-1 text-slate-700 hover:text-red-700 font-medium"
                >
                  <span>Emergency Ambulance</span>
                  <span className="font-mono font-bold">108</span>
                </a>
                <a
                  href="tel:102"
                  className="flex items-center justify-between py-1 text-slate-700 hover:text-red-700 font-medium"
                >
                  <span>Maternal &amp; Child Medical</span>
                  <span className="font-mono font-bold">102</span>
                </a>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Clean-Air Shelters &amp; Clinics
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Locate nearby public hospitals, metro clean-air concourses, and emergency
                  respiratory clinics around {city} using Google Maps Grounding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onFindShelters();
                }}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Locate Nearby Clean-Air Shelters
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500 flex items-center justify-between pt-2 border-t border-slate-200">
            <span>
              Offline-cached AQI &amp; household action rules remain available without internet.
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
