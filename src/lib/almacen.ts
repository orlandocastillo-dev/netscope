// Dónde quedan guardadas las mediciones. Se elige solo, en este orden:
// 1. Publicada en Claude: la base de datos del artefacto, compartida entre todos los celulares del equipo.
// 2. Con el servidor del proyecto: su API, que guarda en SQLite.
// 3. Si no hay ninguno de los dos: solo este navegador.

import { useEffect, useRef, useState } from "react";
import { estabilidad, puntaje } from "./puntaje";
import type { Medicion, NuevaMedicion } from "./tipos";

export type ModoAlmacen = "cargando" | "claude" | "servidor" | "local";

interface Almacen {
  modo: Exclude<ModoAlmacen, "cargando">;
  escuchar(cb: (lista: Medicion[]) => void, error: (msg: string) => void): () => void;
  guardar(m: Medicion): Promise<void>;
  borrar(id: string): Promise<void>;
}

/* ---------- Claude: base de datos del artefacto ---------- */

type DocSnap = { id: string; data(): Record<string, unknown> | undefined };
type DbClaude = {
  collection(path: string): {
    onSnapshot(next: (s: { docs: DocSnap[]; metadata: { fromCache: boolean } }) => void, error?: (e: { code: string; message: string }) => void): () => void;
    doc(id: string): { set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> };
  };
};
type ClaudeRuntime = { use(nombre: string): Promise<unknown> };

const runtime = () => (window as unknown as { claude?: ClaudeRuntime }).claude;

async function almacenClaude(): Promise<Almacen | null> {
  const c = runtime();
  if (!c?.use) return null;
  const db = (await c.use("db").catch(() => null)) as DbClaude | null;
  if (!db) return null;
  const col = db.collection("mediciones");
  return {
    modo: "claude",
    escuchar(cb, error) {
      return col.onSnapshot(
        (s) => cb(s.docs.map((d) => ({ ...(d.data() as unknown as Medicion), id: d.id }))),
        (e) => error(e.code === "revoked" ? "Ya no tienes acceso a los datos de esta página." : "No se pudieron leer las mediciones guardadas."),
      );
    },
    guardar: (m) => col.doc(m.id).set(m as unknown as Record<string, unknown>),
    borrar: (id) => col.doc(id).delete(),
  };
}

/* ---------- Servidor del proyecto ---------- */

async function almacenServidor(): Promise<Almacen | null> {
  try {
    const r = await fetch("api/estado", { cache: "no-store" });
    const j = r.ok ? await r.json() : null;
    // El servidor de Vercel no guarda mediciones (almacen: false): se quedan en el navegador
    if (!j?.netscope || j.almacen === false) return null;
  } catch {
    return null;
  }
  const oyentes = new Set<() => void>();
  const refrescar = () => oyentes.forEach((f) => f());
  return {
    modo: "servidor",
    escuchar(cb, error) {
      let vivo = true;
      const leer = () =>
        fetch("api/mediciones", { cache: "no-store" })
          .then((r) => r.json())
          .then((l: Medicion[]) => vivo && cb(l))
          .catch(() => vivo && error("No se pudieron leer las mediciones del servidor."));
      oyentes.add(leer);
      leer();
      const t = setInterval(leer, 15000);
      return () => {
        vivo = false;
        oyentes.delete(leer);
        clearInterval(t);
      };
    },
    async guardar(m) {
      const r = await fetch("api/mediciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "El servidor rechazó la medición.");
      refrescar();
    },
    async borrar(id) {
      await fetch(`api/mediciones/${encodeURIComponent(id)}`, { method: "DELETE" });
      refrescar();
    },
  };
}

/* ---------- Solo este navegador ---------- */

const CLAVE = "netscope:mediciones";

function almacenLocal(): Almacen {
  const leer = (): Medicion[] => {
    try {
      return JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    } catch {
      return [];
    }
  };
  let lista = leer();
  const oyentes = new Set<(l: Medicion[]) => void>();
  const escribir = (l: Medicion[]) => {
    lista = l;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(l));
    } catch {
      /* sin almacenamiento: queda en memoria mientras la página esté abierta */
    }
    oyentes.forEach((f) => f(l));
  };
  return {
    modo: "local",
    escuchar(cb) {
      oyentes.add(cb);
      cb(lista);
      return () => oyentes.delete(cb);
    },
    async guardar(m) {
      escribir([...lista.filter((x) => x.id !== m.id), m]);
    },
    async borrar(id) {
      escribir(lista.filter((x) => x.id !== id));
    },
  };
}

/* ---------- Hook para las pantallas ---------- */

let elegido: Promise<Almacen> | null = null;
const elegir = () =>
  (elegido ??= (async () => (await almacenClaude()) ?? (await almacenServidor()) ?? almacenLocal())());

export const nuevoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Completa una medición nueva con su id, fecha, estabilidad y puntaje. */
export function completar(n: NuevaMedicion, fecha = new Date()): Medicion {
  return {
    ...n,
    id: nuevoId(),
    fecha: fecha.toISOString(),
    estabilidad: estabilidad(n.jitter, n.perdida),
    puntaje: puntaje(n),
  };
}

export function useMediciones() {
  const [lista, setLista] = useState<Medicion[]>([]);
  const [modo, setModo] = useState<ModoAlmacen>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const almacen = useRef<Almacen | null>(null);

  useEffect(() => {
    let parar = () => {};
    let vivo = true;
    // Si en 10 s no llegan datos, se avisa en vez de quedarse cargando para siempre.
    const espera = setTimeout(() => vivo && setError("Los datos guardados están tardando en llegar."), 10000);
    elegir().then((a) => {
      if (!vivo) return;
      almacen.current = a;
      setModo(a.modo);
      parar = a.escuchar(
        (l) => {
          clearTimeout(espera);
          setError(null);
          setCargando(false);
          setLista([...l].sort((x, y) => x.fecha.localeCompare(y.fecha)));
        },
        (msg) => {
          clearTimeout(espera);
          setCargando(false);
          setError(msg);
        },
      );
    });
    return () => {
      vivo = false;
      clearTimeout(espera);
      parar();
    };
  }, []);

  const conAlmacen = async <T,>(f: (a: Almacen) => Promise<T>) => {
    const a = almacen.current ?? (await elegir());
    return f(a);
  };

  return {
    lista,
    modo,
    error,
    cargando,
    guardar: (m: Medicion) => conAlmacen((a) => a.guardar(m)),
    /** Uno a la vez, para no saturar la base de datos. */
    async guardarVarias(ms: Medicion[]) {
      for (const m of ms) await conAlmacen((a) => a.guardar(m));
    },
    borrar: (id: string) => conAlmacen((a) => a.borrar(id)),
    async borrarVarias(ids: string[]) {
      for (const id of ids) await conAlmacen((a) => a.borrar(id));
    },
  };
}

export type Mediciones = ReturnType<typeof useMediciones>;
