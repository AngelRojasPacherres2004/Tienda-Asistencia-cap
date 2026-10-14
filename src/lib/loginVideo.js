export function setupLoginVideo(element, { document, window, onState = () => {} }) {
  let disposed = false;
  let pending = null;
  let retryTimer = null;
  const update = state => { if (!disposed) onState(state); };
  const play = () => {
    if (disposed || document.visibilityState === "hidden") return;
    element.muted = true;
    element.defaultMuted = true;
    element.playsInline = true;
    element.setAttribute("muted", "");
    if (pending) return;
    try {
      pending = Promise.resolve(element.play())
        .catch(error => { if (error.name !== "AbortError") update(error.name === "NotAllowedError" ? "blocked" : "error"); })
        .finally(() => { pending = null; });
    } catch { pending = null; update("error"); }
  };
  const playing = () => update("playing");
  const stopped = () => {
    update("paused");
    clearTimeout(retryTimer);
    if (!disposed && document.visibilityState !== "hidden" && !element.error) retryTimer = setTimeout(play, 250);
  };
  const failed = () => update("error");
  const interact = () => { if (element.paused) play(); };
  const mediaEvents = { loadeddata: play, canplay: play, playing, pause: stopped, error: failed };
  for (const [name, callback] of Object.entries(mediaEvents)) element.addEventListener(name, callback);
  document.addEventListener("visibilitychange", play);
  document.addEventListener("pointerdown", interact);
  document.addEventListener("keydown", interact);
  window.addEventListener("pageshow", play);
  window.addEventListener("focus", play);
  play();
  return {
    dispose: () => {
      disposed = true;
      clearTimeout(retryTimer);
      for (const [name, callback] of Object.entries(mediaEvents)) element.removeEventListener(name, callback);
      document.removeEventListener("visibilitychange", play);
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
      window.removeEventListener("pageshow", play);
      window.removeEventListener("focus", play);
      element.pause();
    },
  };
}
