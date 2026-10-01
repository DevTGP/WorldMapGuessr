# 1) JS/CSS bündeln (web/build.mjs → worldmapguessr/static/dist)
FROM node:22-slim AS web

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
COPY worldmapguessr/pages.json /app/worldmapguessr/pages.json
COPY worldmapguessr/static/js /app/worldmapguessr/static/js
COPY worldmapguessr/static/css /app/worldmapguessr/static/css
COPY worldmapguessr/static/fonts /app/worldmapguessr/static/fonts
RUN npm run build

# 2) Server
FROM python:3.14.5-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=web /app/worldmapguessr/static/dist worldmapguessr/static/dist

# Brotli- und gzip-Fassungen der Kartendaten und statischen Dateien (worldmapguessr/compression.py)
RUN python -m worldmapguessr.precompress

# Bündel immer nutzen (assets.py vergleicht sonst Zeitstempel mit den Quellen)
ENV WMG_BUNDLE=1

EXPOSE 5000

# 1 Worker: LobbyHub und JSON-Stores halten Zustand im Prozess.
# Threads: jede WebSocket-Verbindung (flask-sock) belegt einen Thread.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "100", "run:app"]
