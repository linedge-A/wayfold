/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local-dev / combined-container entry. Builds the API app from backend-core + the Wayfold domain
 * pack, attaches SPA serving (Vite in dev, static dist in prod), and listens. The Functions deploy
 * uses functions/index.ts instead (createApp only — Hosting serves the SPA).
 */
import dotenv from 'dotenv';
import { createApp, attachSpa } from './server-core';
import { wayfoldConfig } from './server-domain';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const app = createApp(wayfoldConfig);

attachSpa(app).then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server fully operational on http://localhost:${PORT}`);
  });
});
