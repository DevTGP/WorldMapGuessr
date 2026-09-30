// Kartenauswahl: welche Items in die Runde kommen, als Voreinstellung („Preset“) statt Einzelauswahl.
//
//   Kontinente   die 7 Kontinente
//   Länder       Staaten ausgewählter Kontinente (Europa, Asien …), wahlweise ohne Kleinstaaten
//   Alles        Kontinente, alle Staaten (wahlweise ohne Kleinstaaten) und alle Bundesländer
//   Bundesländer Bundesländer/Regionen (bisher: Deutschland)
// Die Konfiguration speichert weiterhin nur Item-Gruppen (config.kinds) und ausgeschlossene Items
// (config.excluded); describeMap() erkennt daraus das Preset. Passt keins, ist es eine „Eigene Auswahl“.

import { GROUPS } from "./config.js";
import { t } from "../i18n/index.js";

/** Kleinstaat: Staat mit weniger Fläche (Natural Earth, inkl. aller Inseln) */
export const SMALL_KM2 = 1100;
const EARTH_R_KM = 6371.0088;

export const MAP_PRESETS = ["continents", "countries", "all", "regions"]
  .map((id) => ({ id, title: t(`mapPreset.${id}`), blurb: t(`mapPreset.${id}.blurb`), soon: false }));

export const COUNTRY_GROUPS = GROUPS.filter((g) => g.id.startsWith("country-"));
const COUNTRY_IDS = COUNTRY_GROUPS.map((g) => g.id);
export const STATE_GROUPS = GROUPS.filter((g) => g.id.startsWith("state-"));
const STATE_IDS = STATE_GROUPS.map((g) => g.id);

export function isSmall(f) {
  return f.kind === "country" && f.geom.area * EARTH_R_KM * EARTH_R_KM < SMALL_KM2;
}

/**
 * Preset in die Konfiguration übernehmen (Regeln bleiben).
 * @param {{preset: string, continents: Set<string>, small: boolean}} sel  continents: Gruppen-IDs (country-eu …)
 */
export function applyMap(config, features, { preset, continents, small }) {
  const present = new Set(features.map((f) => f.group));
  let kinds;
  if (preset === "continents") kinds = ["continent"];
  else if (preset === "countries") kinds = COUNTRY_IDS.filter((g) => continents.has(g));
  else if (preset === "regions") kinds = STATE_IDS;
  else kinds = [...present];
  config.kinds = new Set(kinds.filter((g) => present.has(g)));
  config.excluded = new Set(preset === "continents" || preset === "regions" || small ? []
    : features.filter((f) => config.kinds.has(f.group) && isSmall(f)).map((f) => f.key));
  return config;
}

/**
 * Preset einer Konfiguration erkennen.
 * @returns {{preset: string, continents: string[], small: boolean, label: string}}
 *   preset: continents | countries | regions | all | custom
 */
export function describeMap(config, features) {
  const played = features.filter((f) => config.kinds.has(f.group));
  const excluded = played.filter((f) => config.excluded.has(f.key));
  const smallKeys = played.filter(isSmall);
  const kinds = [...config.kinds].filter((g) => features.some((f) => f.group === g));
  const allGroups = [...new Set(features.map((f) => f.group))];
  const continents = COUNTRY_IDS.filter((g) => config.kinds.has(g));
  const small = excluded.length === 0;
  const smallOnly = !small && excluded.length === smallKeys.length && excluded.every(isSmall);
  const custom = { preset: "custom", continents, small: true, label: t("map.custom") };
  if (!kinds.length) return { ...custom, label: t("map.none") };
  if (!small && !smallOnly) return custom;
  const without = small ? "" : ` ${t("map.withoutSmall")}`;
  if (kinds.length === 1 && kinds[0] === "continent") {
    return small ? { preset: "continents", continents, small: true, label: t("mapPreset.continents") } : custom;
  }
  if (kinds.every((g) => COUNTRY_IDS.includes(g))) {
    const names = continents.length === COUNTRY_IDS.length ? ""
      : ` · ${COUNTRY_GROUPS.filter((g) => config.kinds.has(g.id)).map((g) => g.short).join(", ")}`;
    return { preset: "countries", continents, small, label: `${t("mapPreset.countries")}${names}${without}` };
  }
  if (kinds.every((g) => STATE_IDS.includes(g))) {
    return small ? { preset: "regions", continents, small: true, label: t("mapPreset.regions") } : custom;
  }
  if (allGroups.every((g) => config.kinds.has(g))) return { preset: "all", continents, small, label: `${t("mapPreset.all")}${without}` };
  return custom;
}
