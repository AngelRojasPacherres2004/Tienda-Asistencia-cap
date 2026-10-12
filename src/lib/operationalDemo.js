import { TRAFFIC_HOURS } from "../../shared/metrics.js";

// Local presentation fixture only. No request is written to bd-app.
export const isOperationalDemo = () => import.meta.env.DEV
  && typeof window !== "undefined"
  && new URLSearchParams(window.location.search).get("demo") === "1";

export function datesBetween(from, to) {
  const dates = [];
  for (let date = new Date(`${from}T12:00:00Z`); date <= new Date(`${to}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

export function demoTrafficRecords(stores, dates) {
  const weights = [0, 2, 5, 9, 12, 11, 9, 10, 13, 17, 21, 23, 19, 6];
  return stores.flatMap((store) => dates.flatMap((fecha) =>
    TRAFFIC_HOURS.map((rango_hora, hourIndex) => ({
      tienda_id: Number(store.id), fecha, rango_hora,
      cantidad: Math.round(weights[hourIndex] * (1 + (Number(store.id) % 5) * 0.18) * (1 + (Number(fecha.slice(-2)) % 4) * 0.06)),
      observaciones: "Vista DEMO local",
    }))));
}

export function demoTrafficTotal(store, dates) {
  return demoTrafficRecords([store], dates).reduce((sum, row) => sum + row.cantidad, 0);
}

export function demoZonalComparison(result, from, to) {
  const dates = datesBetween(from, to);
  return { ...result, tiendas: (result.tiendas || []).map((store, index) => {
    const personal = Number(store.personal || 0);
    const tardanzas = Math.min(personal, index % 3);
    const faltas = Math.min(personal - tardanzas, index % 4 === 0 ? 1 : 0);
    const pendientes = Math.min(personal - tardanzas - faltas, index % 5 === 0 ? 1 : 0);
    return { ...store, visitas: demoTrafficTotal(store, dates), presentes: personal - tardanzas - faltas - pendientes, tardanzas, faltas, pendientes };
  }) };
}
