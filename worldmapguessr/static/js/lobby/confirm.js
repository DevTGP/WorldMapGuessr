// Bestätigungsdialog im Seitenstil (statt window.confirm).

/**
 * @param {{title: string, text: string, confirm: string, danger?: boolean}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, text, confirm, danger = false }) {
  const dialog = document.getElementById("confirm-dialog");
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = text;
  const ok = dialog.querySelector("#confirm-ok");
  const cancel = dialog.querySelector("#confirm-cancel");
  ok.textContent = confirm;
  ok.classList.toggle("btn-danger", danger);
  return new Promise((resolve) => {
    const done = (value) => {
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onClose = () => done(false); // Esc
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.showModal();
    cancel.focus();
  });
}
