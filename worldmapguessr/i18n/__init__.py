"""Mehrsprachigkeit (Deutsch, Englisch): Texte je Sprache in de.json / en.json unter gleichen Schlüsseln.

Die Sprache einer Seite: Cookie wmg_lang (de | en, gesetzt über die Einstellungen), sonst die Browsersprache
(Accept-Language: Deutsch → de, sonst en). Vorlagen nutzen t("schlüssel"); der Browser bekommt das Wörterbuch
der Seite mit (window.WMG.i18n) und übersetzt damit alles, was er selbst erzeugt (static/js/i18n/index.js).

Platzhalter: {name}; Mehrzahl: Eintrag {"one": …, "other": …}, gewählt nach n. Fehlt ein Schlüssel im
Englischen, gilt der deutsche Text.
"""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache

from flask import request

LANGS = ("de", "en")
COOKIE = "wmg_lang"
_DIR = os.path.dirname(__file__)
_VAR = re.compile(r"\{(\w+)\}")


@lru_cache(maxsize=None)
def dictionary(lang: str) -> dict:
    with open(os.path.join(_DIR, "de.json"), encoding="utf-8") as fh:
        merged = json.load(fh)
    if lang != "de":
        with open(os.path.join(_DIR, f"{lang}.json"), encoding="utf-8") as fh:
            merged.update(json.load(fh))
    return merged


def negotiate() -> str:
    """Sprache der aktuellen Anfrage"""
    chosen = request.cookies.get(COOKIE)
    if chosen in LANGS:
        return chosen
    return request.accept_languages.best_match(LANGS, default="en")


def translate(lang: str, key: str, **values) -> str:
    text = dictionary(lang).get(key, key)
    if isinstance(text, dict):
        text = text["one"] if values.get("n") == 1 else text["other"]
    return _VAR.sub(lambda m: str(values.get(m.group(1), m.group(0))), text)


def template_context() -> dict:
    """Für Jinja: t(), lang und das Wörterbuch für den Browser"""
    lang = negotiate()
    return {
        "lang": lang,
        "t": lambda key, **values: translate(lang, key, **values),
        "i18n_client": {"lang": lang, "dict": dictionary(lang)},
    }
