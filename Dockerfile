# Wayfold Gemini proxy — standalone deployable (Cloud Run / Fly / Render).
# Two-stage: build with full deps, run with production deps only.
# The server bundle (esbuild --packages=external) imports express/@google/genai/dotenv
# from node_modules at runtime, so the runner stage keeps the production deps.

# ---- build stage ---------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Produces dist/ (built SPA) + dist/server.cjs (bundled server).
RUN npm run build

# ---- runtime stage -------------------------------------------------------------
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
# dist/ carries both the server bundle and the SPA. If you deploy proxy-only, the
# server auto-detects the missing index.html and runs as a pure API proxy.
COPY --from=builder /app/dist ./dist
# Cloud Run injects PORT (default 8080); the server reads process.env.PORT.
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
