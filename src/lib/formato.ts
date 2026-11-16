import type { Medicion } from "./tipos";

export const ms = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`;
export const mbps = (v: number | null) => (v == null ? "—" : `${v < 10 ? v.toFixed(1) : Math.round(v)} Mbps`);
export const pct = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} %`;
export const dbm = (v: number | null) => (v == null ? "—" : `${v} dBm`);

export const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const nombreTipo = (m: Pick<Medicion, "tipo" | "tecnologia">) =>
  m.tipo === "wifi" ? "Wi-Fi" : m.tecnologia ? `Móvil ${m.tecnologia}` : "Datos móviles";

/** Color del puntaje: rojo (0) → ámbar (50) → lima (100). Igual en el dial, el mapa y las listas. */
export function colorPuntaje(p: number, alfa = 1) {
  const t = Math.min(1, Math.max(0, p / 100));
  const rojo = [229, 72, 77];
  const ambar = [229, 169, 59];
  const lima = [198, 242, 78];
  const [a, b, u] = t < 0.5 ? [rojo, ambar, t / 0.5] : [ambar, lima, (t - 0.5) / 0.5];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * u));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alfa})`;
}

/** Color fijo de cada categoría (buena, regular, baja), para pastillas y marcas. */
export const colorCategoria = (p: number) => (p >= 70 ? "var(--positive)" : p >= 40 ? "var(--warning)" : "var(--negative)");

const promedio = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function promedios(lista: Medicion[]) {
  const subidas = lista.map((m) => m.subida).filter((v): v is number => v != null);
  return {
    n: lista.length,
    puntaje: promedio(lista.map((m) => m.puntaje)),
    latencia: promedio(lista.map((m) => m.latencia)),
    jitter: promedio(lista.map((m) => m.jitter)),
    perdida: promedio(lista.map((m) => m.perdida)),
    descarga: promedio(lista.map((m) => m.descarga)),
    subida: subidas.length ? promedio(subidas) : NaN,
    estabilidad: promedio(lista.map((m) => m.estabilidad)),
  };
}

export function csv(lista: Medicion[]) {
  const cols = ["fecha", "lugar", "tipo", "tecnologia", "latitud", "longitud", "precision_m", "plano_x", "plano_y", "latencia_ms", "jitter_ms", "perdida_pct", "descarga_mbps", "subida_mbps", "senal_dbm", "estabilidad", "puntaje", "prueba_ligera", "ejemplo", "servidor"];
  const celda = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const filas = lista.map((m) =>
    [m.fecha, m.lugar, m.tipo, m.tecnologia, m.lat, m.lng, m.precision, m.x, m.y, m.latencia, m.jitter, m.perdida, m.descarga, m.subida, m.senal, m.estabilidad, m.puntaje, m.ligera ? "si" : "no", m.ejemplo ? "si" : "no", m.servidor]
      .map(celda)
      .join(","),
  );
  return [cols.join(","), ...filas].join("\n");
}
