import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app';
import { productionSecurityHeaders } from './server/security';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
// Local development listens on loopback only; production (containers/hosts) listens on all interfaces.
const HOST = process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1');

async function startServer(): Promise<void> {
  const app = createApp();
  const httpServer = http.createServer(app);

  if (!isProduction) {
    // Development: Vite middleware with hot reload.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve the built files with strict security headers.
    const distPath = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distPath, 'index.html');
    if (!fs.existsSync(distIndex)) {
      console.error('Production build not found at dist/index.html. Run "npm run build" first.');
      process.exit(1);
    }
    app.use(productionSecurityHeaders());
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`\nVayuShield AI (${isProduction ? 'production' : 'development'}) is ready!`);
    console.log(`  Open in browser: http://localhost:${PORT}\n`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
