"""Startpunkt für den Entwicklungsserver: python run.py"""
import os

from worldmapguessr import create_app

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.environ.get("WMG_HOST", "127.0.0.1"),
        port=int(os.environ.get("WMG_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
    )
