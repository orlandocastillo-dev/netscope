// Motor de medición, con el procedimiento de la Tabla 2 del informe.
// Las cifras salen de peticiones HTTP cronometradas con el reloj del navegador: sirven para comparar
// puntos entre sí con el mismo navegador y el mismo servidor, no equivalen a un ping ICMP.

import { conTiempo, type ServidorPruebas } from "./servidor";

export type Fase = "preparando" | "latencia" | "descarga" | "subida" | "listo";

export interface Progreso {
  fase: Fase;
  /** Avance total de la prueba, de 0 a 1. */
  avance: number;
  /** Lo último que se midió en esta fase, para mostrarlo en vivo. */
  valor?: number;
  unidad?: "ms" | "Mbps";
}

export interface ResultadoRed {
  latencia: number;
  jitter: number;
  perdida: number;
  descarga: number;
  subida: number | null;
  /** Datos que movió la prueba, en MB. */
  consumo: number;
}

const PETICIONES = 15;
const ESPERA_MAX = 2000;

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function medirLatencia(srv: ServidorPruebas, avisar: (p: Progreso) => void) {
  // La primera petición abre la conexión y distorsiona el tiempo: se descarta.
  try {
    await conTiempo(srv.ping(), ESPERA_MAX);
  } catch {
    /* si falla, igual se intenta medir */
  }
  const tiempos: number[] = [];
  let perdidas = 0;
  for (let i = 0; i < PETICIONES; i++) {
    const t0 = performance.now();
    try {
      const r = await conTiempo(srv.ping(), ESPERA_MAX);
      await r.arrayBuffer();
      if (!r.ok) throw new Error(String(r.status));
      const ms = performance.now() - t0;
      tiempos.push(ms);
      avisar({ fase: "latencia", avance: 0.05 + (0.3 * (i + 1)) / PETICIONES, valor: ms, unidad: "ms" });
    } catch {
      perdidas++;
    }
  }
  if (tiempos.length === 0) throw new Error("El servidor de pruebas no responde. Revisa la conexión e inténtalo de nuevo.");
  // Jitter: promedio de la diferencia entre peticiones consecutivas (versión simplificada del RFC 3550).
  let dif = 0;
  for (let i = 1; i < tiempos.length; i++) dif += Math.abs(tiempos[i] - tiempos[i - 1]);
  return {
    latencia: mediana(tiempos),
    jitter: tiempos.length > 1 ? dif / (tiempos.length - 1) : 0,
    perdida: (perdidas / PETICIONES) * 100,
  };
}

async function medirDescarga(srv: ServidorPruebas, ligera: boolean, avisar: (p: Progreso) => void) {
  const r = await conTiempo(srv.descarga(ligera), 60000);
  if (!r.ok || !r.body) throw new Error("No se pudo descargar el bloque de prueba.");
  const lector = r.body.getReader();
  // El cronómetro arranca con la respuesta: así la latencia no se cuenta como lentitud de la descarga.
  const t0 = performance.now();
  let bytes = 0;
  let ultimo = t0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    bytes += value.byteLength;
    const ahora = performance.now();
    if (ahora - ultimo > 120) {
      ultimo = ahora;
      const mbps = (bytes * 8) / ((ahora - t0) / 1000) / 1e6;
      avisar({ fase: "descarga", avance: 0.35 + 0.35 * Math.min(1, bytes / ((ligera ? 1 : 5) * 1048576)), valor: mbps, unidad: "Mbps" });
    }
  }
  const s = (performance.now() - t0) / 1000;
  const final = (bytes * 8) / Math.max(s, 0.001) / 1e6;
  avisar({ fase: "descarga", avance: 0.7, valor: final, unidad: "Mbps" });
  return { mbps: final, bytes };
}

async function medirSubida(url: string, ligera: boolean, avisar: (p: Progreso) => void) {
  const tam = ligera ? 512 * 1024 : 2 * 1024 * 1024;
  const datos = new Uint8Array(tam);
  // crypto.getRandomValues llena de a 64 KB como máximo
  for (let i = 0; i < tam; i += 65536) crypto.getRandomValues(datos.subarray(i, Math.min(i + 65536, tam)));
  avisar({ fase: "subida", avance: 0.75 });
  const t0 = performance.now();
  const r = await conTiempo(url, 60000, { method: "POST", body: datos, headers: { "Content-Type": "application/octet-stream" } });
  await r.arrayBuffer();
  if (!r.ok) throw new Error("No se pudo enviar el bloque de prueba.");
  const s = (performance.now() - t0) / 1000;
  const mbps = (tam * 8) / Math.max(s, 0.001) / 1e6;
  avisar({ fase: "subida", avance: 0.98, valor: mbps, unidad: "Mbps" });
  return { mbps, bytes: tam };
}

export async function medirRed(srv: ServidorPruebas, ligera: boolean, avisar: (p: Progreso) => void): Promise<ResultadoRed> {
  avisar({ fase: "preparando", avance: 0.02 });
  const lat = await medirLatencia(srv, avisar);
  avisar({ fase: "descarga", avance: 0.35 });
  const desc = await medirDescarga(srv, ligera, avisar);
  let subida: number | null = null;
  let bytesSubida = 0;
  const url = srv.subida?.();
  if (url) {
    const sub = await medirSubida(url, ligera, avisar);
    subida = sub.mbps;
    bytesSubida = sub.bytes;
  }
  avisar({ fase: "listo", avance: 1 });
  return { ...lat, descarga: desc.mbps, subida, consumo: (desc.bytes + bytesSubida) / 1048576 };
}

/** Lo que el navegador deja saber de la red. Solo estimaciones redondeadas, y no en todos los navegadores. */
export function infoNavegador() {
  const c = (navigator as Navigator & { connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number } }).connection;
  if (!c) return undefined;
  return { tipo: c.type, efectivo: c.effectiveType, downlink: c.downlink, rtt: c.rtt };
}
