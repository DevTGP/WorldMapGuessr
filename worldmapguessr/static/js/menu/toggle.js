// Schalter-Feld (Beschriftung + Hinweis + Switch), gleiche Schnittstelle wie der Stepper (value, setHint).

/**
 * @param {{id: string, label: string, hint?: string, value: boolean, onChange: (v: boolean) => void}} opts
 */
export function createToggle({ id, label, hint, value, onChange }) {
  const root = document.createElement("label");
  root.className = "field toggle";
  root.htmlFor = id;
  root.innerHTML = `<span></span><input id="${id}" type="checkbox" role="switch">`;
  const text = root.querySelector("span");
  text.textContent = label;
  const small = document.createElement("small");
  text.append(small);
  const input = root.querySelector("input");
  input.checked = !!value;
  input.addEventListener("change", () => onChange(input.checked));
  const api = {
    el: root,
    get value() { return input.checked; },
    set value(v) { input.checked = !!v; },
    setHint(t) { small.textContent = t; },
  };
  api.setHint(hint ?? "");
  return api;
}
