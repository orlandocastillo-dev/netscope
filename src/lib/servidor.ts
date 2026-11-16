// Contra qué se mide. Con el servidor del proyecto (Node + Express) hay rutas de ping, descarga y subida.
// Publicada como página estática (en Claude), se mide contra los propios archivos de la página:
// un archivo diminuto para la latencia y bloques de datos que no se pueden comprimir para la descarga.

export interface ServidorPruebas {
  tipo: "api" | "estatico";
  nombre: string;
  ping: () => string;
  descarga: (ligera: boolean) => string;
  /** null si este servidor no recibe datos (una página estática no acepta envíos). */
  subida: (() => string) | null;
}

const azar = () => Math.random().toString(36).slice(2);

const API: ServidorPruebas = {
  tipo: "api",
  nombre: "Servidor NetScope",
  ping: () => `api/ping?r=${azar()}`,
  descarga: (ligera) => `api/descarga?mb=${ligera ? 1 : 5}&r=${azar()}`,
  subida: () => `api/subida?r=${azar()}`,
};

const ESTATICO: ServidorPruebas = {
  tipo: "estatico",
  nombre: "Archivos de la página publicada",
  ping: () => `prueba/ping.txt?r=${azar()}`,
  descarga: (ligera) => `prueba/bloque-${ligera ? 1 : 5}mb.png?r=${azar()}`,
  subida: null,
};

async function conTiempo(url: string, ms: number, init?: RequestInit) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: control.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/** Busca primero el servidor del proyecto; si no responde, usa los archivos de la página. */
export async function detectarServidor(): Promise<ServidorPruebas> {
  try {
    const r = await conTiempo("api/estado", 2500);
    if (r.ok) {
      const j = await r.json();
      if (j?.netscope) return API;
    }
  } catch {
    /* sin servidor: se sigue con los archivos */
  }
  return ESTATICO;
}

export { conTiempo };
