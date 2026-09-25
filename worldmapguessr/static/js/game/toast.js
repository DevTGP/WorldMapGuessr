// Kurze Rückmeldung über dem Inventar.

export function createToast(el) {
  let timer;
  return (text, kind = "") => {
    el.textContent = text;
    el.className = `toast show ${kind}`;
    clearTimeout(timer);
    timer = setTimeout(() => { el.className = `toast ${kind}`; }, 1800);
  };
}
