const navigationKey = "asiste-store-navigation";

export function restartStoreNavigation(account, page, notice = "") {
  try {
    sessionStorage.setItem(navigationKey, JSON.stringify({ id: account.id, rol: account.rol, page, notice }));
  } catch { /* Reloading still clears pending forms and requests when storage is unavailable. */ }
  window.location.reload();
}

export function consumeStoreNavigation(account) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(navigationKey) || "null");
    sessionStorage.removeItem(navigationKey);
    return saved && Number(saved.id) === Number(account.id) && saved.rol === account.rol && typeof saved.page === "string" ? saved : null;
  } catch { return null; }
}
