import React, { useEffect, useRef, useState } from 'react';
import {
  Bolt,
  Brain,
  Download,
  ExternalLink,
  Globe,
  MapPin,
  Mic,
  Palette,
  Send,
  Square,
} from 'lucide-react';
import type { AQIResponse, CityPreset, HouseholdProfile } from '../types/env';

type AIMode = 'standard' | 'fast' | 'thinking' | 'search' | 'maps';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelLabel?: string;
  links?: Array<{ title: string; uri: string }>;
}

interface AIAssistantStudioProps {
  selectedCity: CityPreset;
  aqi: AQIResponse | null;
  activeHousehold: HouseholdProfile;
  initialPrompt?: string | null;
  initialMode?: AIMode;
}

export const AIAssistantStudio: React.FC<AIAssistantStudioProps> = ({
  selectedCity,
  aqi,
  activeHousehold,
  initialPrompt,
  initialMode,
}) => {
  const [mode, setMode] = useState<AIMode>(initialMode || 'standard');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      modelLabel: 'VayuShield AI Environmental Advisor (Free Tier)',
      text: `Namaste! Ask me about ${selectedCity.name}'s current AQI (${aqi?.aqi ?? 'live'}), find nearby clean-air parks or clinics via Google Maps Grounding, check live pollution news with Google Search, or use your microphone to dictate symptoms or questions.`,
    },
  ]);
  const [loading, setLoading] = useState(false);

  // Audio transcription state (gemini-3.5-transcribe)
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Free Canvas Awareness Poster Studio state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [posterPrompt, setPosterPrompt] = useState('Wear N95 Mask & Seal Windows During Smog');
  const [posterHeadline, setPosterHeadline] = useState(`Breathe Safer in ${selectedCity.name}`);
  const [posterSubhead, setPosterSubhead] = useState(
    `Live AQI ${aqi?.aqi ?? 150} · Community Clean-Air Protocol`,
  );
  const [posterBullets, setPosterBullets] = useState<string[]>([
    'Wear a fitted N95 mask on busy commutes',
    'Run HEPA purification & wet-mop floors daily',
    'Keep children & seniors indoors when AQI > 150',
  ]);
  const [posterTheme, setPosterTheme] = useState<'teal' | 'amber' | 'slate'>('teal');
  const [composingPoster, setComposingPoster] = useState(false);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
    if (initialPrompt) {
      setInput(initialPrompt);
    }
  }, [initialPrompt, initialMode]);

  // Draw live awareness poster onto HTML5 canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette =
      posterTheme === 'teal'
        ? { bg: '#0F172A', accent: '#14B8A6', card: '#1E293B', text: '#F8FAFC' }
        : posterTheme === 'amber'
          ? { bg: '#1C1917', accent: '#F59E0B', card: '#292524', text: '#FAFaf9' }
          : { bg: '#F8FAFC', accent: '#0D9488', card: '#FFFFFF', text: '#0F172A' };

    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Top accent bar
    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, 0, canvas.width, 16);

    // Header badge
    ctx.fillStyle = palette.accent;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('VAYUSHIELD AI · COMMUNITY HEALTH ADVISORY', 40, 64);

    // Headline
    ctx.fillStyle = palette.text;
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(posterHeadline.slice(0, 36), 40, 118);

    // Subhead
    ctx.fillStyle = posterTheme === 'slate' ? '#475569' : '#CBD5E1';
    ctx.font = '500 18px sans-serif';
    ctx.fillText(posterSubhead.slice(0, 56), 40, 154);

    // Inner card
    ctx.fillStyle = palette.card;
    ctx.fillRect(40, 188, canvas.width - 80, 240);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 188, canvas.width - 80, 240);

    // Action bullets
    ctx.fillStyle = palette.text;
    ctx.font = '600 19px sans-serif';
    posterBullets.slice(0, 3).forEach((b, idx) => {
      const y = 244 + idx * 64;
      ctx.fillStyle = palette.accent;
      ctx.fillText(`0${idx + 1}.`, 66, y);
      ctx.fillStyle = palette.text;
      ctx.fillText(b.slice(0, 48), 110, y);
    });

    // Footer attribution
    ctx.fillStyle = posterTheme === 'slate' ? '#64748B' : '#94A3B8';
    ctx.font = '14px monospace';
    ctx.fillText(
      `${selectedCity.name} · Live AQI ${aqi?.aqi ?? '—'} · Source: Open-Meteo / WHO Guidelines`,
      40,
      468,
    );
  }, [posterHeadline, posterSubhead, posterBullets, posterTheme, selectedCity.name, aqi?.aqi]);

  const sendMessage = async (textOverride?: string) => {
    const queryText = (textOverride ?? input).trim();
    if (!queryText || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: queryText,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!textOverride) setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          mode,
          history: nextHistory
            .filter((m) => m.id !== 'welcome')
            .slice(-10)
            .map((m) => ({ role: m.role, text: m.text })),
          context: {
            city: selectedCity.name,
            latitude: selectedCity.latitude,
            longitude: selectedCity.longitude,
            aqi: aqi?.aqi,
            category: aqi?.category,
            householdSummary: `${activeHousehold.members.length} members (${activeHousehold.members.map((m) => `${m.ageGroup}:${m.conditions.join(',') || 'healthy'}`).join('; ')})`,
          },
        }),
      });
      const json = (await res.json()) as {
        reply?: string;
        model?: string;
        links?: Array<{ title: string; uri: string }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || 'AI service returned an error.');
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: json.reply || '',
          modelLabel: json.model || 'gemini-4-hydrogen',
          links: json.links || [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          modelLabel: 'System Notice',
          text: err instanceof Error ? err.message : 'Unable to reach Gemini AI.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRecording = async () => {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setTranscribing(true);
        try {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = String(reader.result || '').split(',')[1] || '';
            const res = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
              }),
            });
            const data = (await res.json()) as { transcript?: string; error?: string };
            if (data.transcript) {
              setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript!));
            }
            setTranscribing(false);
          };
          reader.readAsDataURL(blob);
        } catch {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `mic-err-${Date.now()}`,
          role: 'model',
          modelLabel: 'Microphone',
          text: 'Microphone permission was denied or unavailable in this browser.',
        },
      ]);
    }
  };

  const handleComposePoster = async () => {
    setComposingPoster(true);
    try {
      const res = await fetch('/api/ai/poster-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: posterPrompt,
          city: selectedCity.name,
          aqi: aqi?.aqi ?? 150,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          headline?: string;
          subhead?: string;
          bullets?: string[];
        };
        if (json.headline) setPosterHeadline(json.headline);
        if (json.subhead) setPosterSubhead(json.subhead);
        if (json.bullets?.length) setPosterBullets(json.bullets);
      }
    } finally {
      setComposingPoster(false);
    }
  };

  const handleDownloadPoster = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `vayushield-advisory-${selectedCity.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Multi-turn Grounded Gemini Chat + Voice Transcription */}
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl flex flex-col h-[640px]">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">VayuShield AI Health Advisor</h2>
              <p className="text-xs text-slate-500">
                Conversational guidance only — deterministic clinical safety thresholds always take
                priority.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'standard', label: 'Advisor (Hydrogen)', icon: MessageIcon },
              { id: 'fast', label: 'Low Latency (Flash Lite)', icon: Bolt },
              { id: 'thinking', label: 'High Thinking', icon: Brain },
              { id: 'search', label: 'Google Search', icon: Globe },
              { id: 'maps', label: 'Google Maps Places', icon: MapPin },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id as AIMode)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                    mode === m.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {msg.modelLabel && (
                <span className="text-[11px] font-mono text-slate-500 mb-1">{msg.modelLabel}</span>
              )}
              <div
                className={`max-w-[88%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-900 border border-slate-200'
                }`}
              >
                {msg.text}
                {msg.links && msg.links.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-200 space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Grounded Sources
                    </p>
                    {msg.links.map((l, idx) => (
                      <a
                        key={idx}
                        href={l.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{l.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs font-mono text-slate-500">
              Analyzing environmental context...
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('maps');
                void sendMessage(
                  `Find clean green parks and respiratory clinics near ${selectedCity.name}`,
                );
              }}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
            >
              Nearby Parks &amp; Clinics
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('search');
                void sendMessage(
                  `Latest air quality and GRAP advisory updates for ${selectedCity.name} today`,
                );
              }}
              className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md"
            >
              Latest AQI News
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? 'Stop voice recording' : 'Record voice question'}
              className={`p-2.5 rounded-lg border transition-colors shrink-0 ${
                recording
                  ? 'bg-red-600 text-white border-red-700'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <label htmlFor="ai-chat-input" className="sr-only">
              Ask VayuShield AI
            </label>
            <input
              id="ai-chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                transcribing
                  ? 'Transcribing audio via Gemini 3.5 Transcribe...'
                  : 'Ask about AQI, masks, schools, or nearby shelters...'
              }
              className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              Send
            </button>
          </form>
        </div>
      </section>

      {/* Free Community Awareness Poster & Card Designer */}
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" aria-hidden="true" />
              Awareness Poster Studio (Free)
            </h2>
            <p className="text-xs text-slate-500">
              Create &amp; edit printable PNG community air-quality cards for WhatsApp or school
              noticeboards.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Poster topic prompt"
              value={posterPrompt}
              onChange={(e) => setPosterPrompt(e.target.value)}
              placeholder="Poster topic (e.g. School bus smog safety)"
              className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={handleComposePoster}
              disabled={composingPoster}
              className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
            >
              {composingPoster ? 'Drafting...' : 'AI Draft Copy'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              aria-label="Poster headline"
              value={posterHeadline}
              onChange={(e) => setPosterHeadline(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            />
            <select
              aria-label="Poster color theme"
              value={posterTheme}
              onChange={(e) => setPosterTheme(e.target.value as 'teal' | 'amber' | 'slate')}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
            >
              <option value="teal">Deep Slate &amp; Teal</option>
              <option value="amber">High-Alert Amber</option>
              <option value="slate">Clean Printable Light</option>
            </select>
          </div>

          <input
            type="text"
            aria-label="Poster subhead"
            value={posterSubhead}
            onChange={(e) => setPosterSubhead(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
          />
        </div>

        <canvas
          ref={canvasRef}
          width={640}
          height={500}
          className="w-full h-auto rounded-lg border border-slate-200"
        />

        <button
          type="button"
          onClick={handleDownloadPoster}
          className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 inline-flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          Download PNG Awareness Poster
        </button>
      </section>
    </div>
  );
};

function MessageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
