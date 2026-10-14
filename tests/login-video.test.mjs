import test from "node:test";
import assert from "node:assert/strict";
import { setupLoginVideo } from "../src/lib/loginVideo.js";

function fixture({ reduced = false, blocked = false } = {}) {
  const element = new EventTarget();
  element.paused = true;
  element.setAttribute = () => {};
  element.pause = () => { element.paused = true; element.dispatchEvent(new Event("pause")); };
  element.calls = 0;
  element.play = () => {
    element.calls++;
    if (blocked) return Promise.reject(Object.assign(new Error("Autoplay bloqueado"), { name: "NotAllowedError" }));
    element.paused = false;
    element.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  };
  const motionPreference = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const window = new EventTarget();
  const states = [];
  const controls = setupLoginVideo(element, { motionPreference, document, window, onState: state => states.push(state) });
  return { element, motionPreference, document, window, controls, states, unblock: () => { blocked = false; } };
}
const settled = () => new Promise(resolve => setImmediate(resolve));

test("el video se silencia y recupera reproducción tras bloqueo inicial", async () => {
  const setup = fixture({ blocked: true });
  await settled();
  assert.equal(setup.states.at(-1), "blocked");
  assert.equal(setup.element.muted, true);
  assert.equal(setup.element.defaultMuted, true);
  setup.unblock();
  setup.document.dispatchEvent(new Event("pointerdown"));
  await settled();
  assert.equal(setup.states.at(-1), "playing");
  setup.controls.dispose();
});
test("reproduce automáticamente incluso con reducción de movimiento", async () => {
  const setup = fixture({ reduced: true });
  await settled();
  assert.equal(setup.element.calls, 1);
  assert.equal(setup.states.at(-1), "playing");
  setup.controls.dispose();
});
test("recupera una pausa inesperada sin controles manuales", async () => {
  const setup = fixture();
  await settled();
  setup.element.pause();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(setup.element.calls, 2);
  assert.equal(setup.element.paused, false);
  setup.controls.dispose();
});
test("la pestaña oculta pausa el video y se recupera al regresar; desmontaje limpia listeners", async () => {
  const setup = fixture();
  await settled();
  setup.document.visibilityState = "hidden";
  setup.element.pause();
  setup.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(setup.element.paused, true);
  setup.document.visibilityState = "visible";
  setup.document.dispatchEvent(new Event("visibilitychange"));
  await settled();
  assert.equal(setup.element.paused, false);
  setup.controls.dispose();
  const calls = setup.element.calls;
  setup.window.dispatchEvent(new Event("focus"));
  setup.element.dispatchEvent(new Event("canplay"));
  assert.equal(setup.element.calls, calls);
});
