"""items.json von Hand nach MongoDB übernehmen (Alternative zum automatischen Import beim Start).

    MONGODB_URI="mongodb://wmg:PASSWORT@localhost:27017/worldmapguessr?authSource=worldmapguessr" \\
        python -m worldmapguessr.storage.migrate_items instance/items.json

Mehrfach ausführbar: bereits übernommene UIDs werden übersprungen.
"""
import json
import os
import sys

from .mongo import connect
from .mongo_items import MongoItemStore


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("MONGODB_URI ist nicht gesetzt.")
        return 2
    with open(argv[1], encoding="utf-8") as f:
        data = json.load(f)
    store = MongoItemStore(connect(uri, os.environ.get("MONGODB_DB") or None)["items"])
    print("Ergebnis:", store.import_json(data))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
