// Auswahl der Spielteile: pro Art eine Gruppe mit Checkbox-Zeilen (Icon, Name, Code),
// "Alle"/"Keine" je Gruppe und Suche. Abgewählte Teile werden ausgeschlossen.

import { iconPath } from "../map/icon.js";
import { KIND_LABELS } from "./config.js";

const ICON_W = 34;
const ICON_H = 24;
const collator = new Intl.Collator("de");

export class ItemPicker {
  /**
   * @param {HTMLElement} container
   * @param {{kind: string, features: object[]}[]} groups
   * @param {() => void} onChange
   */
  constructor(container, groups, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.config = null;
    this.rows = new Map(); // key → {row, checkbox, text}
    this.groups = new Map(); // kind → {el, count}
    this._build(groups);
  }

  _build(groups) {
    for (const { kind, features } of groups) {
      const label = KIND_LABELS[kind]?.title ?? kind;
      const section = document.createElement("section");
      section.className = "picker-group";
      section.dataset.kind = kind;
      section.innerHTML = `
        <header>
          <h4>${label} <span class="count"></span></h4>
          <div class="group-actions">
            <button type="button" class="link" data-all="1">Alle</button>
            <button type="button" class="link" data-all="0">Keine</button>
          </div>
        </header>
        <ul></ul>`;
      const ul = section.querySelector("ul");
      const sorted = features.slice().sort((a, b) => collator.compare(a.properties.name, b.properties.name));
      for (const f of sorted) {
        const li = document.createElement("li");
        li.innerHTML = `
          <label>
            <input type="checkbox">
            <svg viewBox="0 0 ${ICON_W} ${ICON_H}" aria-hidden="true"><path d="${iconPath(f, ICON_W, ICON_H, 1.5)}"/></svg>
            <span class="name"></span>
            <span class="code"></span>
          </label>`;
        li.querySelector(".name").textContent = f.properties.name;
        li.querySelector(".code").textContent = f.id;
        const checkbox = li.querySelector("input");
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) this.config.excluded.delete(f.key);
          else this.config.excluded.add(f.key);
          this.refresh();
          this.onChange();
        });
        ul.append(li);
        this.rows.set(f.key, { row: li, checkbox, kind, text: `${f.properties.name} ${f.id}`.toLowerCase() });
      }
      section.querySelectorAll("[data-all]").forEach((b) => b.addEventListener("click", () => {
        const include = b.dataset.all === "1";
        for (const [key, r] of this.rows) {
          if (r.kind !== kind || r.row.hidden) continue; // nur sichtbare (Suche) betreffen
          if (include) this.config.excluded.delete(key); else this.config.excluded.add(key);
        }
        this.refresh();
        this.onChange();
      }));
      this.container.append(section);
      this.groups.set(kind, { el: section, count: section.querySelector(".count") });
    }
  }

  /** Zustand aus der Konfiguration übernehmen */
  bind(config) {
    this.config = config;
    this.refresh();
  }

  refresh() {
    const c = this.config;
    const per = new Map();
    for (const [key, r] of this.rows) {
      const on = !c.excluded.has(key);
      r.checkbox.checked = on;
      r.row.classList.toggle("off", !on);
      const g = per.get(r.kind) ?? { on: 0, all: 0 };
      g.all += 1; g.on += on ? 1 : 0;
      per.set(r.kind, g);
    }
    for (const [kind, g] of this.groups) {
      const n = per.get(kind);
      g.count.textContent = `${n.on} / ${n.all}`;
      g.el.hidden = !c.kinds.has(kind); // Arten, die nicht gespielt werden, ausblenden
    }
  }

  filter(query) {
    const q = query.trim().toLowerCase();
    for (const r of this.rows.values()) r.row.hidden = q !== "" && !r.text.includes(q);
  }
}
