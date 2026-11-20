<div align="center">

# 🌬️ VayuShield AI

**Know your air. Protect your family.**

Live air quality for Indian cities, health advice for your household, a community pollution map and a 3D air lab. It works offline and installs like an app.

![Node](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-offline%20ready-0D9488)
![Tests](https://img.shields.io/badge/tests-50%20passing-brightgreen)
![Platforms](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-supported-blue)

</div>

---

## ⚡ Install in one command

You need two free tools first: **[Node.js 20 or newer](https://nodejs.org/)** and **[Git](https://git-scm.com/)**.
Then copy **one** line for your computer, paste it in the terminal, and press Enter. It downloads the app, installs everything, builds it and opens it for you.

### 🪟 Windows

Open **PowerShell** and paste:

```powershell
git clone https://github.com/Brijwasi0565/VayuShield-AI-.git; cd VayuShield-AI-; powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 🍎 macOS and 🐧 Linux

Open **Terminal** and paste:

```bash
git clone https://github.com/Brijwasi0565/VayuShield-AI-.git && cd VayuShield-AI- && bash install.sh
```

Then open **http://localhost:3000** in your browser. Press `Ctrl + C` in the terminal to stop the app.

> **No Git?** Click **Code → Download ZIP** on GitHub, unzip it, then on Windows double-click **`install.bat`**, or on Mac/Linux run `bash install.sh` inside the folder.

<details>
<summary><b>Installer options</b></summary>

| What you want | Windows | macOS / Linux |
| --- | --- | --- |
| Install, build and start | `.\install.ps1` | `bash install.sh` |
| Install and build only | `.\install.ps1 -NoStart` | `bash install.sh --no-start` |
| Developer mode (live reload) | `.\install.ps1 -Dev` | `bash install.sh --dev` |

</details>

---

## ✨ What you get

| Feature | What it does |
| --- | --- |
| 🌫️ **Live air quality** | Indian AQI (CPCB standard) with a 7-day forecast, for any Indian city or your GPS location |
| 🏠 **Household health guide** | Add family members (children, elders, asthma and more) and get clear daily advice based on WHO and CPCB rules |
| 🔥 **Fire and smoke alerts** | Nearby fires from NASA satellites |
| 🗺️ **Community map** | See and report smoke, dust and clean-air zones near you |
| 🧪 **3D Air Lab** | Play with a 3D air purifier and see how particles move |
| 🤖 **AI assistant** | Ask air-quality questions, use your voice, and make awareness posters (optional, needs a free Gemini key) |
| 🚨 **Emergency mode** | A warning and checklist when air becomes dangerous (AQI above 300) |
| 🌐 **7 languages** | English, Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati |
| 📴 **Works offline** | Install it on your phone or computer, and your data stays on your device |

> **100% free to run.** Air quality, weather, fire alerts, maps, the 3D lab and health advice need **no account and no API key**.

---

## 🔑 Optional keys (only if you want extras)

The installer creates a file called `.env` for you. Open it and fill in only what you need. Leave the rest blank.

| Setting | Gives you | Get it free |
| --- | --- | --- |
| `GEMINI_API_KEY` | AI chat, voice and poster text | [Google AI Studio](https://aistudio.google.com/apikey) |
| `NASA_FIRMS_API_KEY` | More detailed fire data | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) |
| `WAQI_API_KEY` | Backup air-quality source | [WAQI](https://aqicn.org/data-platform/token/) |
| `OPENAQ_API_KEY` | Ground station readings | [OpenAQ](https://explore.openaq.org/) |
| `VITE_FIREBASE_*` | Cloud sync and Google sign-in | [Firebase Console](https://console.firebase.google.com/) |

After you change `.env`, stop the app (`Ctrl + C`) and start it again with `npm start`.

### 🔒 Keep your keys safe

- **Never** upload your `.env` file to GitHub. It is already blocked by `.gitignore`.
- Your Gemini key stays on the server. It is never sent to the browser.
- If you use Firebase, restrict its key to your website in Google Cloud Console. See [SECURITY.md](SECURITY.md).
- If a key is ever exposed, **revoke it first**. Deleting the file is not enough.

---

## 🛠️ Everyday commands

| Command | What it does |
| --- | --- |
| `npm start` | Run the built app at http://localhost:3000 |
| `npm run dev` | Developer mode with live reload |
| `npm run build` | Build the app for production |
| `npm test` | Run all 50 tests |
| `npm run test:coverage` | Tests plus a coverage report |
| `npm run check` | Type check, format check, tests and build in one go |

---

## 🧩 How it is built

```
VayuShield-AI/
├── server.ts          # starts the server
├── server/            # API routes, security headers, rate limits (+ tests)
├── src/
│   ├── components/    # screens: dashboard, map, 3D lab, health hub, AI studio
│   ├── services/      # Firebase and offline database (IndexedDB)
│   └── utils/         # AQI maths, health rules, translations (+ tests)
├── firestore.rules    # database security rules
├── install.sh         # installer for macOS / Linux
├── install.ps1        # installer for Windows
└── install.bat        # double-click installer for Windows
```

**Tech:** React 19, TypeScript, Vite, Tailwind CSS, Express, Three.js, Leaflet, Dexie (offline storage), Firebase (optional), Google Gemini (optional).

**Data sources:** Open-Meteo (air quality and weather), NASA EONET and FIRMS (fires), OpenStreetMap (maps and search).

---

## 🩺 Something not working?

| Problem | Fix |
| --- | --- |
| `node` is not recognised | Install Node.js from https://nodejs.org/ and open a **new** terminal |
| `git` is not recognised | Install Git from https://git-scm.com/, or use **Download ZIP** |
| Port 3000 is busy | Set `PORT=3001` in `.env`, then start again |
| Windows blocks the script | Use the PowerShell command above. It allows the script for this one run only |
| AI chat says "not configured" | Add `GEMINI_API_KEY` to `.env` and restart |

---

## 🤝 Contributing and security

Run `npm run check` before sending changes. Read [SECURITY.md](SECURITY.md) to report a problem privately.

## 📄 License

[MIT](LICENSE)

> VayuShield AI gives general guidance, not medical advice. For breathing problems or an emergency, see a doctor or call your local emergency number.
