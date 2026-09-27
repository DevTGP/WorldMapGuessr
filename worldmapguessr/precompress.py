"""gzip-Fassungen aller statischen Dateien erzeugen (Docker-Build): python -m worldmapguessr.precompress"""
import os
import sys

from .compression import precompress

if __name__ == "__main__":
    static = os.path.join(os.path.dirname(__file__), "static")
    print(f"{precompress(static)} Dateien komprimiert", file=sys.stderr)
