# Security Policy

## Reporting a problem

Please do **not** open a public issue for security problems.
Use GitHub: **Security tab > Report a vulnerability** on this repository.
You will get a reply within a few days.

## How VayuShield AI protects you

| Area | What we do |
| --- | --- |
| Secrets | `.env` and key files are git-ignored. `.env.example` holds blank placeholders only. A secret scan (gitleaks) runs on every push. |
| Gemini API key | Used **only on the server**. It is never sent to the browser or bundled into the app. |
| Firebase web key | Read from `VITE_FIREBASE_*` in `.env`. It is public by design, so restrict it (see below). |
| Server headers | Strict Content-Security-Policy, `nosniff`, frame blocking, referrer policy in production. |
| Abuse protection | Per-IP rate limits on every API route, small request-size limits, input validation with Zod. |
| Uploads | Community photos accept PNG, JPEG, WebP and GIF only. SVG and other types are rejected. |
| Errors | Visitors see short, safe messages. Upstream error text and stack traces are never returned. |
| Database | Firestore rules deny by default and validate every field (`firestore.rules`). |
| Dependencies | `npm audit` and Dependabot run automatically. |

## Rules for contributors

1. Never commit `.env`, `firebase-applet-config.json`, service-account files or any key.
2. Put new settings in `.env.example` with a **blank** value.
3. Run `npm run check` before opening a pull request.

## If a key was exposed

Deleting the file is **not enough**: the key stays in git history. Do this instead:

1. **Revoke or rotate the key first** in Google Cloud Console > APIs & Services > Credentials.
2. Create a new key and **restrict** it:
   - Application restriction: HTTP referrers (your website address only).
   - API restriction: only the APIs you use (for Firebase web: Identity Toolkit, Firestore, Token Service).
3. Check **Billing** and **API usage** for anything unexpected. Set a budget alert.
4. In GitHub: **Security > Secret scanning**, mark the alert as **Revoked** after rotating.
5. Optional clean history: use `git filter-repo` or BFG, then force-push. The old key is still compromised, so step 1 is what protects you.

## Turn on GitHub's own protection

Repository **Settings > Code security**: enable **Secret scanning**, **Push protection**, **Dependabot alerts**, and **Private vulnerability reporting**.
