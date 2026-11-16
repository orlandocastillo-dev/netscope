// Puntaje de calidad de 0 a 100, con los pesos y rangos de la Tabla 3 del informe.
// Los pesos son un criterio del proyecto, no un estándar: se ajustarán con mediciones reales.

export const PESOS = {
  descarga: 0.25,
  latencia: 0.2,
  perdida: 0.2,
  subida: 0.15,
  jitter: 0.1,
  senal: 0.1,
} as const;

export const RANGOS = {
  descarga: { bueno: 50, malo: 2 }, // Mbps, escala logarítmica
  subida: { bueno: 20, malo: 1 }, // Mbps, escala logarítmica
  latencia: { bueno: 20, malo: 250 }, // ms
  jitter: { bueno: 3, malo: 50 }, // ms
  perdida: { bueno: 0, malo: 5 }, // %
  senal: { bueno: -50, malo: -90 }, // dBm
} as const;

const recortar = (v: number) => Math.min(1, Math.max(0, v));

/** Lineal: sirve tanto si "más es mejor" (señal) como si "menos es mejor" (latencia). */
const lineal = (v: number, bueno: number, malo: number) => recortar((v - malo) / (bueno - malo));

/** Logarítmica: pasar de 2 a 10 Mbps se nota mucho más que de 40 a 48. */
const logaritmica = (v: number, bueno: number, malo: number) =>
  v <= 0 ? 0 : recortar((Math.log(v) - Math.log(malo)) / (Math.log(bueno) - Math.log(malo)));

export interface Valores {
  latencia: number;
  jitter: number;
  perdida: number;
  descarga: number;
  subida: number | null;
  senal: number | null;
}

/** Cada parámetro llevado a la escala 0-100 (null si no se midió). */
export function parciales(v: Valores) {
  return {
    descarga: logaritmica(v.descarga, RANGOS.descarga.bueno, RANGOS.descarga.malo) * 100,
    subida: v.subida == null ? null : logaritmica(v.subida, RANGOS.subida.bueno, RANGOS.subida.malo) * 100,
    latencia: lineal(v.latencia, RANGOS.latencia.bueno, RANGOS.latencia.malo) * 100,
    jitter: lineal(v.jitter, RANGOS.jitter.bueno, RANGOS.jitter.malo) * 100,
    perdida: lineal(v.perdida, RANGOS.perdida.bueno, RANGOS.perdida.malo) * 100,
    senal: v.senal == null ? null : lineal(v.senal, RANGOS.senal.bueno, RANGOS.senal.malo) * 100,
  };
}

/** Si falta un dato (la señal, o la subida), su peso se reparte entre los demás. */
export function puntaje(v: Valores) {
  const p = parciales(v);
  let suma = 0;
  let pesos = 0;
  for (const [clave, peso] of Object.entries(PESOS) as [keyof typeof PESOS, number][]) {
    const valor = p[clave];
    if (valor == null) continue;
    suma += valor * peso;
    pesos += peso;
  }
  return Math.round(suma / pesos);
}

/** Estabilidad: jitter y pérdida en partes iguales, de 0 a 100. */
export function estabilidad(jitter: number, perdida: number) {
  const p = parciales({ latencia: 0, jitter, perdida, descarga: 1, subida: null, senal: null });
  return Math.round((p.jitter + p.perdida) / 2);
}

export type Categoria = "buena" | "regular" | "baja";

export const categoria = (puntos: number): Categoria => (puntos >= 70 ? "buena" : puntos >= 40 ? "regular" : "baja");

export const NOMBRE_CATEGORIA: Record<Categoria, string> = { buena: "Buena", regular: "Regular", baja: "Baja" };

/** Frases en lenguaje sencillo sobre lo que falló (o lo que va bien). */
export function explicaciones(v: Valores): { tono: "mal" | "aviso" | "bien"; texto: string }[] {
  const salida: { tono: "mal" | "aviso" | "bien"; texto: string }[] = [];
  if (v.latencia > 150) salida.push({ tono: "mal", texto: `La latencia es alta (${Math.round(v.latencia)} ms): las páginas tardarán en reaccionar y las videollamadas se pueden desfasar.` });
  else if (v.latencia > 80) salida.push({ tono: "aviso", texto: `La latencia es moderada (${Math.round(v.latencia)} ms): se navega bien, pero los juegos en línea lo pueden notar.` });
  if (v.perdida >= 2) salida.push({ tono: "mal", texto: `Se pierden peticiones (${v.perdida.toFixed(1)} %): habrá cortes o congelamientos en llamadas y video.` });
  else if (v.perdida > 0) salida.push({ tono: "aviso", texto: `Hubo alguna petición sin respuesta (${v.perdida.toFixed(1)} %).` });
  if (v.jitter > 30) salida.push({ tono: "mal", texto: `La conexión es inestable: la latencia varía mucho (jitter de ${Math.round(v.jitter)} ms).` });
  else if (v.jitter > 15) salida.push({ tono: "aviso", texto: `La latencia varía algo (jitter de ${Math.round(v.jitter)} ms).` });
  if (v.descarga < 5) salida.push({ tono: "mal", texto: `La descarga es lenta (${v.descarga.toFixed(1)} Mbps): el video en alta calidad se va a detener.` });
  else if (v.descarga < 15) salida.push({ tono: "aviso", texto: `La descarga alcanza para navegar y video normal (${v.descarga.toFixed(1)} Mbps), no para mucho más.` });
  if (v.subida != null && v.subida < 2) salida.push({ tono: "mal", texto: `La subida es baja (${v.subida.toFixed(1)} Mbps): enviar archivos o transmitir la cámara va a costar.` });
  if (v.senal != null && v.senal <= -80) salida.push({ tono: "mal", texto: `La señal es débil (${v.senal} dBm): estás lejos de la antena o del router, o hay obstáculos.` });
  if (salida.length === 0) salida.push({ tono: "bien", texto: "Todo en orden: la conexión responde rápido, estable y sin pérdidas." });
  return salida;
}
