"""Speicher-Backends: MongoDB (wenn MONGODB_URI gesetzt ist) oder JSON-Dateien im instance-Ordner."""
from .factory import create_stores, StorageInfo

__all__ = ["create_stores", "StorageInfo"]
