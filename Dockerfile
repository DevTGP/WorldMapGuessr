FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt "gunicorn>=23"

COPY run.py .
COPY worldmapguessr ./worldmapguessr

RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app/instance \
    && chown app:app /app/instance
USER app

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/', timeout=4)"

# 1 Worker: LobbyHub und JSON-Stores halten Zustand im Prozess.
# Threads: jede WebSocket-Verbindung (flask-sock) belegt einen Thread.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "100", "--access-logfile", "-", "run:app"]
