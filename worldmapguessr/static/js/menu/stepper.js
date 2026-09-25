// Zahlen-Stepper: [−] Zahl [+], mit Tastatur (Pfeile) und direkter Eingabe.

/**
 * @param {{id: string, label: string, hint?: string, value: number, min: number, max: number,
 *          onChange: (v: number) => void}} opts
 */
export function createStepper({ id, label, hint, value, min, max, onChange }) {
  const root = document.createElement("div");
  root.className = "field stepper";
  root.innerHTML = `
    <label for="${id}">${label}${hint ? `<small>${hint}</small>` : ""}</label>
    <div class="stepper-control">
      <button type="button" class="step" data-d="-1" aria-label="${label} verringern">−</button>
      <input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1">
      <button type="button" class="step" data-d="1" aria-label="${label} erhöhen">+</button>
    </div>`;
  const input = root.querySelector("input");
  const minus = root.querySelector('[data-d="-1"]');
  const plus = root.querySelector('[data-d="1"]');
  let current = value;
  let limit = { min, max };

  const set = (v, emit = true) => {
    current = Math.max(limit.min, Math.min(limit.max, Math.round(Number(v)) || limit.min));
    input.value = current;
    minus.dataset.lockedByLimit = current <= limit.min ? "1" : "0";
    plus.dataset.lockedByLimit = current >= limit.max ? "1" : "0";
    const ro = root.closest(".readonly") !== null;
    minus.disabled = ro || current <= limit.min;
    plus.disabled = ro || current >= limit.max;
    if (emit) onChange(current);
  };
  root.querySelectorAll(".step").forEach((b) =>
    b.addEventListener("click", () => set(current + Number(b.dataset.d))));
  input.addEventListener("change", () => set(input.value));
  set(value, false);

  return {
    el: root,
    get value() { return current; },
    set value(v) { set(v, false); },
    /** Obergrenze ändern (z. B. Startteile ≤ Teile im Spiel) */
    setMax(max) { limit = { ...limit, max }; input.max = max; set(current, false); },
  };
}
