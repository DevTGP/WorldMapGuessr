FROM python:3.14.5-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# 1 Worker: LobbyHub und JSON-Stores halten Zustand im Prozess.
# Threads: jede WebSocket-Verbindung (flask-sock) belegt einen Thread.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "100", "run:app"]
