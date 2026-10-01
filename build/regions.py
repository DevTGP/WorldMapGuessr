"""Bundesländer, Regionen und Provinzen europäischer Staaten aus Natural Earth Admin-1 (für 1-cells.py).

Je Staat die oberste Verwaltungsebene; wo Natural Earth eine feinere Ebene führt, zusammengefasst
(Frankreich 13 Regionen, Italien 20 Regionen, Spanien 17 autonome Gemeinschaften + Ceuta und Melilla,
Belgien 3 Regionen, Vereinigtes Königreich 4 Landesteile, Slowenien 12 und Nordmazedonien 8 statistische
Regionen, Lettland 5 Planungsregionen, Kosovo 7 Bezirke, Bosnien und Herzegowina 3 Entitäten, Norwegen
Fylker seit 2024). Ohne Mikrostaaten (Andorra, Liechtenstein, Malta, Monaco, San Marino, Vatikanstadt).

state_id(Staat, Admin-1-Properties) → ID des Bundesland-Items oder None (Fläche geht an das Nachbarland
mit der längsten gemeinsamen Grenze, z. B. Ungarns Städte mit Komitatsrecht).
names(ID, Properties) → (deutsch, englisch).
"""

# Staat (Item-Code) → ISO-3166-1-Alpha-2 für die Menü-Gruppe "state-xx"
STATE_COUNTRIES = {
    "ALB": "AL", "AUT": "AT", "BEL": "BE", "BGR": "BG", "BIH": "BA", "BLR": "BY", "CHE": "CH", "CZE": "CZ",
    "DEU": "DE", "DNK": "DK", "ESP": "ES", "EST": "EE", "FIN": "FI", "FRA": "FR", "GBR": "GB", "GRC": "GR",
    "HRV": "HR", "HUN": "HU", "IRL": "IE", "ISL": "IS", "ITA": "IT", "LTU": "LT", "LUX": "LU", "LVA": "LV",
    "MDA": "MD", "MKD": "MK", "MNE": "ME", "NLD": "NL", "NOR": "NO", "POL": "PL", "PRT": "PT", "ROU": "RO",
    "RUS": "RU", "SRB": "RS", "SVK": "SK", "SVN": "SI", "SWE": "SE", "UKR": "UA", "XKX": "XK",
}
# Item-Code → adm0_a3 in Admin-1, wo abweichend
ADMIN1_CODE = {"XKX": "KOS"}

# Vorsilben/Endungen in Natural Earth name_de bzw. name_en, die wegfallen
DE_PREFIXES = ("Großgemeinde ", "Gemeinde ", "Komitat ", "Kreis ", "Rajongemeinde ", "Rajon ", "Okrug ", "Opština ",
               "Kanton ", "Provinz ", "Bezirk ", "Woiwodschaft ", "Qark ", "Gespanschaft ", "Autonome ")
EN_SUFFIXES = (" Voivodeship",)
# Staaten, deren deutscher Name in Natural Earth uneinheitlich ist: deutsch = englisch
DE_FROM_EN = {"SVK", "SWE"}

# Zusammengefasste Regionen: Natural-Earth-Feld region → ID
REGION_IDS = {
    "FRA": {
        "Auvergne-Rhône-Alpes": "FR-ARA", "Bourgogne-Franche-Comté": "FR-BFC", "Bretagne": "FR-BRE",
        "Centre-Val de Loire": "FR-CVL", "Corse": "FR-20R", "Grand Est": "FR-GES", "Hauts-de-France": "FR-HDF",
        "Île-de-France": "FR-IDF", "Normandie": "FR-NOR", "Nouvelle-Aquitaine": "FR-NAQ", "Occitanie": "FR-OCC",
        "Pays de la Loire": "FR-PDL", "Provence-Alpes-Côte-d'Azur": "FR-PAC",
    },
    "ESP": {
        "Andalucía": "ES-AN", "Aragón": "ES-AR", "Asturias": "ES-AS", "Canary Is.": "ES-CN", "Cantabria": "ES-CB",
        "Castilla y León": "ES-CL", "Castilla-La Mancha": "ES-CM", "Cataluña": "ES-CT", "Ceuta": "ES-CE",
        "Extremadura": "ES-EX", "Foral de Navarra": "ES-NC", "Galicia": "ES-GA", "Islas Baleares": "ES-IB",
        "La Rioja": "ES-RI", "Madrid": "ES-MD", "Melilla": "ES-ML", "Murcia": "ES-MC", "País Vasco": "ES-PV",
        "Valenciana": "ES-VC",
    },
    "BEL": {"Capital Region": "BE-BRU", "Flemish": "BE-VLG", "Walloon": "BE-WAL"},
    "LVA": {"Kurzeme": "LV-KUR", "Zemgale": "LV-ZEM", "Vidzeme": "LV-VID", "Latgale": "LV-LAT", "Riga": "LV-RIX"},
    "SVN": {
        "Pomurska": "SI-031", "Podravska": "SI-032", "Koroška": "SI-033", "Savinjska": "SI-034", "Zasavska": "SI-035",
        "Spodnjeposavska": "SI-036", "Jugovzhodna Slovenija": "SI-037", "Notranjsko-kraška": "SI-038",
        "Osrednjeslovenska": "SI-041", "Gorenjska": "SI-042", "Goriška": "SI-043", "Obalno-kraška": "SI-044",
    },
    "XKX": {
        "Pristina": "XK-PR", "Prizren": "XK-PZ", "Peć": "XK-PE", "Đakovica": "XK-GJ", "Gnjilane": "XK-GL",
        "Uroševac": "XK-FE", "Kosovska Mitrovica": "XK-MI",
    },
}
UK_PARTS = {"England": "GB-ENG", "Scotland": "GB-SCT", "Wales": "GB-WLS", "Northern Ireland": "GB-NIR"}
# Nordmazedonien: Gemeinde → statistische Region (Natural Earth führt die Regionen fehlerhaft)
MK_REGIONS = {
    "MK-EAS": (3, 14, 23, 33, 37, 42, 51, 60, 63, 81, 83),
    "MK-NEA": (43, 44, 47, 48, 65, 71),
    "MK-PEL": (4, 25, 27, 45, 46, 53, 55, 62, 66),
    "MK-POL": (6, 8, 16, 19, 30, 35, 50, 75, 76),
    "MK-SKO": (1, 2, 9, 17, 29, 32, 34, 38, 39, 68, 70, 74, 77, 79, 82, 84, 85),
    "MK-SEA": (5, 7, 10, 11, 18, 26, 41, 56, 64, 73),
    "MK-SWE": (12, 15, 21, 22, 28, 31, 40, 52, 57, 58, 61, 72, 78),
    "MK-VAR": (13, 20, 24, 36, 49, 54, 67, 69, 80),
}
MK_OF = {f"MK-{n:02d}": rid for rid, nums in MK_REGIONS.items() for n in nums}
# Norwegen: Fylker vor 2020 → seit 2024 (Bouvetinsel fällt weg)
NO_2024 = {
    "NO-01": "NO-31", "NO-02": "NO-32", "NO-06": "NO-33", "NO-07": "NO-39", "NO-08": "NO-40", "NO-19": "NO-55",
    "NO-20": "NO-56", "NO-04": "NO-34", "NO-05": "NO-34", "NO-09": "NO-42", "NO-10": "NO-42", "NO-12": "NO-46",
    "NO-14": "NO-46", "NO-16": "NO-50", "NO-17": "NO-50", "NO-X01~": None,
}
# Einzelne IDs, die in Natural Earth falsch oder doppelt sind
ID_FIX = {
    "ISL": {"IS-0": "IS-1"},                                     # Reykjavík gehört zur Hauptstadtregion
    "MDA": {"MD-CAM": "MD-SN", "MD-GRI": "MD-SN"},              # Transnistrien
    "RUS": {"RU-X01~": None},                                     # namenloses Stück am Ob
}

NAMES = {
    # Frankreich
    "FR-ARA": ("Auvergne-Rhône-Alpes", "Auvergne-Rhône-Alpes"),
    "FR-BFC": ("Bourgogne-Franche-Comté", "Bourgogne-Franche-Comté"),
    "FR-BRE": ("Bretagne", "Brittany"), "FR-CVL": ("Centre-Val de Loire", "Centre-Val de Loire"),
    "FR-20R": ("Korsika", "Corsica"), "FR-GES": ("Grand Est", "Grand Est"),
    "FR-HDF": ("Hauts-de-France", "Hauts-de-France"), "FR-IDF": ("Île-de-France", "Île-de-France"),
    "FR-NOR": ("Normandie", "Normandy"), "FR-NAQ": ("Nouvelle-Aquitaine", "Nouvelle-Aquitaine"),
    "FR-OCC": ("Okzitanien", "Occitania"), "FR-PDL": ("Pays de la Loire", "Pays de la Loire"),
    "FR-PAC": ("Provence-Alpes-Côte d’Azur", "Provence-Alpes-Côte d’Azur"),
    # Italien (Feld region_cod)
    "IT-21": ("Piemont", "Piedmont"), "IT-23": ("Aostatal", "Aosta Valley"), "IT-25": ("Lombardei", "Lombardy"),
    "IT-32": ("Trentino-Südtirol", "Trentino-South Tyrol"), "IT-34": ("Venetien", "Veneto"),
    "IT-36": ("Friaul-Julisch Venetien", "Friuli-Venezia Giulia"), "IT-42": ("Ligurien", "Liguria"),
    "IT-45": ("Emilia-Romagna", "Emilia-Romagna"), "IT-52": ("Toskana", "Tuscany"), "IT-55": ("Umbrien", "Umbria"),
    "IT-57": ("Marken", "Marche"), "IT-62": ("Latium", "Lazio"), "IT-65": ("Abruzzen", "Abruzzo"),
    "IT-67": ("Molise", "Molise"), "IT-72": ("Kampanien", "Campania"), "IT-75": ("Apulien", "Apulia"),
    "IT-77": ("Basilikata", "Basilicata"), "IT-78": ("Kalabrien", "Calabria"), "IT-82": ("Sizilien", "Sicily"),
    "IT-88": ("Sardinien", "Sardinia"),
    # Spanien
    "ES-AN": ("Andalusien", "Andalusia"), "ES-AR": ("Aragonien", "Aragon"), "ES-AS": ("Asturien", "Asturias"),
    "ES-CN": ("Kanarische Inseln", "Canary Islands"), "ES-CB": ("Kantabrien", "Cantabria"),
    "ES-CL": ("Kastilien und León", "Castile and León"), "ES-CM": ("Kastilien-La Mancha", "Castilla–La Mancha"),
    "ES-CT": ("Katalonien", "Catalonia"), "ES-CE": ("Ceuta", "Ceuta"), "ES-EX": ("Extremadura", "Extremadura"),
    "ES-NC": ("Navarra", "Navarre"), "ES-GA": ("Galicien", "Galicia"), "ES-IB": ("Balearen", "Balearic Islands"),
    "ES-RI": ("La Rioja", "La Rioja"), "ES-MD": ("Madrid", "Madrid"), "ES-ML": ("Melilla", "Melilla"),
    "ES-MC": ("Murcia", "Murcia"), "ES-PV": ("Baskenland", "Basque Country"), "ES-VC": ("Valencia", "Valencia"),
    # Belgien, Vereinigtes Königreich, Bosnien und Herzegowina
    "BE-BRU": ("Brüssel", "Brussels"), "BE-VLG": ("Flandern", "Flanders"), "BE-WAL": ("Wallonien", "Wallonia"),
    "GB-ENG": ("England", "England"), "GB-SCT": ("Schottland", "Scotland"), "GB-WLS": ("Wales", "Wales"),
    "GB-NIR": ("Nordirland", "Northern Ireland"),
    "BA-BIH": ("Föderation Bosnien und Herzegowina", "Federation of Bosnia and Herzegovina"),
    "BA-SRP": ("Republika Srpska", "Republika Srpska"), "BA-BRC": ("Brčko", "Brčko District"),
    # Lettland, Slowenien, Nordmazedonien, Kosovo
    "LV-KUR": ("Kurland", "Courland"), "LV-ZEM": ("Semgallen", "Semigallia"), "LV-VID": ("Livland", "Vidzeme"),
    "LV-LAT": ("Lettgallen", "Latgale"), "LV-RIX": ("Riga", "Riga"),
    "SI-031": ("Pomurje", "Mura"), "SI-032": ("Podravje", "Drava"), "SI-033": ("Koroška", "Carinthia"),
    "SI-034": ("Savinjska", "Savinja"), "SI-035": ("Zasavje", "Central Sava"), "SI-036": ("Posavje", "Lower Sava"),
    "SI-037": ("Südostslowenien", "Southeast Slovenia"),
    "SI-038": ("Primorsko-notranjska", "Littoral–Inner Carniola"),
    "SI-041": ("Zentralslowenien", "Central Slovenia"), "SI-042": ("Oberkrain", "Upper Carniola"),
    "SI-043": ("Goriška", "Gorizia"), "SI-044": ("Obalno-kraška", "Coastal–Karst"),
    "MK-EAS": ("Ost", "Eastern"), "MK-NEA": ("Nordost", "Northeastern"), "MK-PEL": ("Pelagonien", "Pelagonia"),
    "MK-POL": ("Polog", "Polog"), "MK-SKO": ("Skopje", "Skopje"), "MK-SEA": ("Südost", "Southeastern"),
    "MK-SWE": ("Südwest", "Southwestern"), "MK-VAR": ("Vardar", "Vardar"),
    "XK-PR": ("Pristina", "Pristina"), "XK-PZ": ("Prizren", "Prizren"), "XK-PE": ("Peja", "Peja"),
    "XK-GJ": ("Gjakova", "Gjakova"), "XK-GL": ("Gjilan", "Gjilan"), "XK-FE": ("Ferizaj", "Ferizaj"),
    "XK-MI": ("Mitrovica", "Mitrovica"),
    # Norwegen, Island
    "NO-03": ("Oslo", "Oslo"), "NO-11": ("Rogaland", "Rogaland"), "NO-15": ("Møre og Romsdal", "Møre og Romsdal"),
    "NO-18": ("Nordland", "Nordland"), "NO-21": ("Spitzbergen", "Svalbard"), "NO-31": ("Østfold", "Østfold"),
    "NO-32": ("Akershus", "Akershus"), "NO-33": ("Buskerud", "Buskerud"), "NO-34": ("Innlandet", "Innlandet"),
    "NO-39": ("Vestfold", "Vestfold"), "NO-40": ("Telemark", "Telemark"), "NO-42": ("Agder", "Agder"),
    "NO-46": ("Vestland", "Vestland"), "NO-50": ("Trøndelag", "Trøndelag"), "NO-55": ("Troms", "Troms"),
    "NO-56": ("Finnmark", "Finnmark"),
    "IS-1": ("Hauptstadtregion", "Capital Region"), "IS-2": ("Suðurnes", "Southern Peninsula"),
    "IS-3": ("Westisland", "Western Region"), "IS-4": ("Westfjorde", "Westfjords"),
    "IS-5": ("Nordwestisland", "Northwestern Region"), "IS-6": ("Nordostisland", "Northeastern Region"),
    "IS-7": ("Ostisland", "Eastern Region"), "IS-8": ("Südisland", "Southern Region"),
    # Einzelne Namen
    "DE-HB": ("Bremen", "Bremen"),
    "BG-22": ("Sofia-Stadt", "Sofia City"), "BG-23": ("Sofia (Oblast)", "Sofia Province"),
    "BY-BR": ("Brest", "Brest"), "BY-HO": ("Gomel", "Gomel"), "BY-VI": ("Witebsk", "Vitebsk"),
    "BY-HR": ("Grodno", "Grodno"), "BY-MA": ("Mogiljow", "Mogilev"), "BY-MI": ("Minsk (Oblast)", "Minsk Region"),
    "BY-HM": ("Minsk", "Minsk"),
    "CH-SG": ("St. Gallen", "St. Gallen"),
    "CZ-US": ("Ústí", "Ústí nad Labem"), "CZ-LI": ("Liberec", "Liberec"), "CZ-KA": ("Karlsbad", "Karlovy Vary"),
    "CZ-PL": ("Pilsen", "Plzeň"), "CZ-JC": ("Südböhmen", "South Bohemia"), "CZ-KR": ("Königgrätz", "Hradec Králové"),
    "CZ-OL": ("Olmütz", "Olomouc"), "CZ-PA": ("Pardubice", "Pardubice"),
    "CZ-MO": ("Mährisch-Schlesien", "Moravian-Silesia"), "CZ-JM": ("Südmähren", "South Moravia"),
    "CZ-ZL": ("Zlín", "Zlín"), "CZ-VY": ("Vysočina", "Vysočina"), "CZ-ST": ("Mittelböhmen", "Central Bohemia"),
    "CZ-PR": ("Prag", "Prague"),
    "DK-81": ("Nordjütland", "North Denmark"), "DK-82": ("Mitteljütland", "Central Denmark"),
    "DK-83": ("Süddänemark", "Southern Denmark"), "DK-84": ("Hauptstadtregion", "Capital Region"),
    "DK-85": ("Seeland", "Zealand"),
    "GR-B": ("Zentralmakedonien", "Central Macedonia"), "GR-E": ("Thessalien", "Thessaly"),
    "HR-01": ("Zagreb (Gespanschaft)", "Zagreb County"), "HR-21": ("Zagreb", "City of Zagreb"),
    "HR-08": ("Primorje-Gorski kotar", "Primorje-Gorski Kotar"), "HR-11": ("Požega-Slawonien", "Požega-Slavonia"),
    "IE-D": ("Dublin", "Dublin"), "IE-TA": ("Tipperary", "Tipperary"),
    "MD-SN": ("Transnistrien", "Transnistria"), "MD-GA": ("Gagausien", "Gagauzia"),
    "PT-30": ("Madeira", "Madeira"),
    "RS-13": ("Pomoravlje", "Pomoravlje"), "RS-19": ("Rasina", "Rasina"), "RS-20": ("Nišava", "Nišava"),
    "UA-30": ("Kiew", "Kyiv"), "UA-32": ("Kiew (Oblast)", "Kyiv Oblast"),
    "RU-MOW": ("Moskau", "Moscow"), "RU-MOS": ("Oblast Moskau", "Moscow Oblast"),
    "RU-LEN": ("Oblast Leningrad", "Leningrad Oblast"),
    "RU-AL": ("Republik Altai", "Altai Republic"), "RU-ALT": ("Region Altai", "Altai Krai"),
    "RU-YEV": ("Jüdische Autonome Oblast", "Jewish Autonomous Oblast"),
    "RU-KHM": ("Chanten und Mansen", "Khanty-Mansi"), "RU-YAN": ("Jamal-Nenzen", "Yamalo-Nenets"),
    "RU-NEN": ("Nenzen", "Nenets"), "RU-CHU": ("Tschukotka", "Chukotka"),
    "UA-43": ("Krim", "Crimea"), "UA-40": ("Sewastopol", "Sevastopol"),
}


def state_id(code, p):
    """ID des Bundesland-Items für ein Admin-1-Feature von Staat code; None: Fläche an den Nachbarn"""
    sid = p.get("iso_3166_2")
    if code in REGION_IDS:
        return REGION_IDS[code].get(p.get("region"))
    if code == "ITA":
        return p["region_cod"].strip()
    if code == "GBR":
        return UK_PARTS[p["geonunit"]]
    if code == "MKD":
        return MK_OF[sid]
    if code == "BIH":
        return "BA-BIH" if p.get("type_en") == "Canton" else "BA-BRC" if sid == "BA-BRC" else "BA-SRP"
    if code == "HUN" and p.get("type_en") == "Urban county":
        return None
    if code == "NOR":
        return NO_2024.get(sid, sid)
    if code == "HRV" and "Požega" in (p.get("name_de") or ""):
        return "HR-11"                                          # in Natural Earth doppelt als HR-12
    if code == "RUS" and sid in ("RU-MOW", "RU-MOS"):
        return "RU-MOS" if p["name"] == "Moskovskaya" else "RU-MOW"  # in Natural Earth vertauscht
    return ID_FIX.get(code, {}).get(sid, sid)


# Englische Namen, die in Natural Earth adjektivisch sind (Woiwodschaften)
EN_FIX = {
    "PL-DS": "Lower Silesia", "PL-KP": "Kuyavia-Pomerania", "PL-MA": "Lesser Poland", "PL-MZ": "Masovia",
    "PL-PK": "Subcarpathia", "PL-PM": "Pomerania", "PL-SK": "Holy Cross", "PL-SL": "Silesia",
    "PL-WN": "Warmia-Masuria", "PL-WP": "Greater Poland", "PL-ZP": "West Pomerania",
}


def names(code, sid, p):
    if sid in NAMES:
        return NAMES[sid]
    en = EN_FIX.get(sid) or p.get("name_en") or p["name"]
    for s in EN_SUFFIXES:
        en = en.removesuffix(s)
    de = en if code in DE_FROM_EN else (p.get("name_de") or p["name"])
    for s in DE_PREFIXES:
        de = de.removeprefix(s)
    return de, en
