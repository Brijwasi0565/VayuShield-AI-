# VayuShield AI — Render deployment and API setup

## Render service settings

- Runtime: Node
- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`
- Node version: 24.12.0 or newer (required by the resolved Firebase SDK dependencies)

## Environment variables

Add the following in Render → your Web Service → Environment. Do not add quotes around values.

| Key | Value |
| --- | --- |
| `GEMINI_API_KEY` | Your Gemini API key (the backend does not read `GOOGLE_API_KEY`) |
| `NASA_FIRMS_API_KEY` | Your NASA FIRMS MAP_KEY |
| `WAQI_API_KEY` | Your WAQI token |
| `OPENAQ_API_KEY` | Your OpenAQ API key |
| `VITE_FIREBASE_API_KEY` | Firebase Web App `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `vayushield-ai.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `vayushield-ai` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `vayushield-ai.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `904450867059` |
| `VITE_FIREBASE_APP_ID` | `1:904450867059:web:10a649e3e86ddd345e4f06` |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | `(default)` |
| `TRUST_PROXY` | `1` |

The four API credentials (Gemini, NASA FIRMS, WAQI and OpenAQ) are intentionally not embedded in this ZIP. Enter their current values directly in Render's Environment page. The Firebase web config is included in `.env.example` because Firebase web configuration is designed to be used by the browser; apply API restrictions and Firebase security rules.

## Firebase console setup

1. In Firebase Authentication → Sign-in method, enable Google.
2. Add `vayushield-ai.onrender.com` to Authentication → Settings → Authorized domains.
3. Create/enable the Cloud Firestore database if you want cloud sync and community reports.
4. Deploy the repository's `firestore.rules` before using cloud data. Review the rules for the collections your app uses.
5. The app requests Google Calendar event access for its calendar features. If you do not want calendar integration, remove that feature/scope from the application rather than granting unnecessary access.

## Important deployment behavior

- Variables beginning with `VITE_` are embedded into the frontend at build time. After changing them in Render, trigger a new deploy/rebuild.
- Server-side variables (`GEMINI_API_KEY`, `NASA_FIRMS_API_KEY`, `WAQI_API_KEY`, `OPENAQ_API_KEY`) are read by the Node server at runtime.
- Render's free filesystem is ephemeral. The local JSON community-report store is not durable across all restarts/redeploys. Use Firestore for persistent shared reports, or a persistent disk/database on a plan that supports it.
- Open-Meteo and NASA EONET do not need API keys. Temporary upstream rate limits or outages can still happen; the app should display a fallback/error rather than fabricated live readings.
