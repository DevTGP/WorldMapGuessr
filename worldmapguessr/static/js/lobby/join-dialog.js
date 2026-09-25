// Dialog für Namen (und ggf. Passwort): beim Beitreten und beim Erstellen einer Lobby.

/**
 * @param {{title: string, text?: string, submit: string, askPassword?: boolean, name?: string,
 *          error?: string, cancelable?: boolean}} opts
 * @returns {Promise<{name: string, password: string} | null>}  null = abgebrochen
 */
export function askPlayer({ title, text = "", submit, askPassword = false, name = "", error = "", cancelable = false }) {
  const dialog = document.getElementById("join-dialog");
  const form = dialog.querySelector("form");
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector(".join-text").textContent = text;
  dialog.querySelector(".join-error").textContent = error;
  dialog.querySelector(".join-error").hidden = !error;
  const nameInput = dialog.querySelector("#join-name");
  const pwField = dialog.querySelector(".join-password");
  const pwInput = dialog.querySelector("#join-password");
  const cancel = dialog.querySelector("#join-cancel");
  nameInput.value = name;
  pwInput.value = "";
  pwField.hidden = !askPassword;
  pwInput.required = askPassword;
  cancel.hidden = !cancelable;
  dialog.querySelector("#join-submit").textContent = submit;

  return new Promise((resolve) => {
    const done = (value) => {
      form.removeEventListener("submit", onSubmit);
      cancel.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onEsc);
      dialog.close();
      resolve(value);
    };
    const onSubmit = (e) => {
      e.preventDefault();
      const n = nameInput.value.trim();
      if (!n) { nameInput.focus(); return; }
      done({ name: n, password: pwInput.value });
    };
    const onCancel = () => done(null);
    const onEsc = (e) => { if (!cancelable) e.preventDefault(); else done(null); };
    form.addEventListener("submit", onSubmit);
    cancel.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onEsc);
    dialog.showModal();
    (askPassword && name ? pwInput : nameInput).focus();
  });
}

/** Unheilbarer Fehler (Lobby weg) – mit Weg zurück zum Einzelspiel */
export function showLobbyGone(message, title = "Lobby nicht verfügbar") {
  const dialog = document.getElementById("lobby-gone");
  document.querySelectorAll("dialog[open]").forEach((d) => d !== dialog && d.close());
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = message;
  dialog.addEventListener("cancel", (e) => e.preventDefault());
  dialog.showModal();
}
