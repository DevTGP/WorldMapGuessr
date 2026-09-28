import json

import pytest

from worldmapguessr.item_store import InvalidEvent, ItemStore, UnknownItem


def test_ensure_is_idempotent_and_uid_stable(tmp_path):
    path = tmp_path / "items.json"
    a = ItemStore(path).ensure("continent", "AF", "Afrika")
    b = ItemStore(path).ensure("continent", "AF", "Afrika")  # neu geladen
    assert a["uid"] == b["uid"]
    assert len(ItemStore(path).list()) == 1


def test_record_counts_and_persists(tmp_path):
    path = tmp_path / "items.json"
    store = ItemStore(path)
    uid = store.ensure("continent", "EU", "Europa")["uid"]
    store.record(uid, "spawned")
    store.record(uid, "correct")
    store.record(uid, "incorrect")
    store.record(uid, "incorrect")
    saved = json.loads(path.read_text(encoding="utf-8"))["items"][uid]
    assert (saved["spawned"], saved["correct"], saved["incorrect"]) == (1, 1, 2)


def test_errors(tmp_path):
    store = ItemStore(tmp_path / "items.json")
    uid = store.ensure("continent", "AS", "Asien")["uid"]
    with pytest.raises(InvalidEvent):
        store.record(uid, "gewonnen")
    with pytest.raises(UnknownItem):
        store.record("gibt-es-nicht", "spawned")


def test_waited_adds_sum_and_count(tmp_path):
    path = tmp_path / "items.json"
    store = ItemStore(path)
    uid = store.ensure("country", "FRA", "Frankreich")["uid"]
    store.record(uid, "waited", 4)
    item = store.record(uid, "waited", 0)
    assert (item["waited"], item["waitedCount"]) == (4, 2)
    for bad in (-1, 1.5, "3", True):
        with pytest.raises(InvalidEvent):
            store.record(uid, "waited", bad)


def test_old_items_without_waited_fields_still_count(tmp_path):
    path = tmp_path / "items.json"
    uid = ItemStore(path).ensure("country", "ITA", "Italien")["uid"]
    data = json.loads(path.read_text(encoding="utf-8"))
    for k in ("waited", "waitedCount"):
        del data["items"][uid][k]
    path.write_text(json.dumps(data), encoding="utf-8")
    assert ItemStore(path).record(uid, "waited", 3)["waitedCount"] == 1
