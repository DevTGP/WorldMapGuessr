// „Lobby beitreten“ im Hauptmenü: Code oder Einladungslink eingeben, prüfen, ob es die Lobby gibt.

import { identity } from "../lobby/identity.js";
import { t } from "../i18n/index.js";

const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/; // wie lobbies/codes.py

/** Code aus Eingabe („k7m2q“, „https://…/K7M2Q“) oder null */
export function parseCode(text) {
  const last = String(text || "").trim().split(/[/?#]/).filter(Boolean).pop() ?? "";
  const code = last.toUpperCase();
  return CODE.test(code) ? code : null;
}

/**
 * @param {string} apiBase
 * @returns {Promise<string|null>}  Code einer bestehenden Lobby oder null (abgebrochen)
 */
export function askLobbyCode(apiBase) {
  const dialog = document.getElementById("code-dialog");
  const form = dialog.querySelector("form");
  const input = dialog.querySelector("#code-input");
  const error = dialog.querySelector(".join-error");
  const cancel = dialog.querySelector("#code-cancel");
  input.value = "";
  error.hidden = true;

  return new Promise((resolve) => {
    const done = (value) => {
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const fail = (text) => {
      error.textContent = text;
      error.hidden = false;
      input.focus();
      input.select();
    };
    const onSubmit = async (e) => {
      e.preventDefault();
      const code = parseCode(input.value);
      if (!code) return fail(t("code.invalid"));
      try {
        const res = await fetch(`${apiBase}/lobbies/${code}`);
        if (res.status === 404) return fail(t("code.notFound", { code }));
        const info = await res.json();
        if (info.solo && !identity.get(code)) return fail(t("code.solo", { code }));
      } catch {
        return fail(t("error.offline"));
      }
      done(code);
    };
    const onCancel = () => done(null);
    const onClose = () => done(null); // Esc
    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    input.focus();
  });
}
