// Servidor de NetScope: contraparte de las pruebas de red y API de mediciones.
// Node.js + Express, con SQLite (módulo node:sqlite, incluido en Node 22) como base de datos.

import express from "express";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { estabilidad, puntaje } from "../src/lib/puntaje.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUERTO = Number(process.env.PORT) || 3000;
const RUTA_DB = process.env.NETSCOPE_DB || join(raiz, "datos", "netscope.db");

mkdirSync(dirname(RUTA_DB), { recursive: true });
const db = new DatabaseSync(RUTA_DB);
db.exec(`
  CREATE TABLE IF NOT EXISTS mediciones (
    id TEXT PRIMARY KEY,
    fecha TEXT NOT NULL,
    lugar TEXT NOT NULL,
    tipo TEXT NOT NULL,
    ejemplo INTEGER NOT NULL DEFAULT 0,
    datos TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS mediciones_fecha ON mediciones (fecha);
`);

const app = express();
app.disable("x-powered-by");

// Nada de caché en las rutas de prueba: cada petición tiene que llegar al servidor
const sinCache = (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
};

app.get("/api/estado", sinCache, (_req, res) => {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM mediciones").get();
  res.json({ netscope: true, version: 2, mediciones: n });
});

/* ---------- Pruebas de red ---------- */

app.get("/api/ping", sinCache, (_req, res) => res.type("text/plain").send("ok"));

// Bytes aleatorios: no se pueden comprimir, así que lo que se mide es lo que viaja
app.get("/api/descarga", sinCache, (req, res) => {
  const mb = Math.min(25, Math.max(0.25, Number(req.query.mb) || 5));
  const total = Math.round(mb * 1024 * 1024);
  res.set({ "Content-Type": "application/octet-stream", "Content-Length": String(total), "Content-Encoding": "identity" });
  const bloque = 64 * 1024;
  let enviados = 0;
  const escribir = () => {
    while (enviados < total) {
      const n = Math.min(bloque, total - enviados);
      enviados += n;
      if (!res.write(randomBytes(n))) return res.once("drain", escribir);
    }
    res.end();
  };
  escribir();
});

// La subida se recibe y se descarta; solo se cuentan los bytes
app.post("/api/subida", sinCache, (req, res) => {
  let bytes = 0;
  req.on("data", (c) => (bytes += c.length));
  req.on("end", () => res.json({ bytes }));
});

/* ---------- Mediciones ---------- */

const numero = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

function validar(m) {
  const errores = [];
  if (typeof m?.lugar !== "string" || !m.lugar.trim() || m.lugar.length > 60) errores.push("lugar: texto de 1 a 60 caracteres");
  if (!["wifi", "movil"].includes(m?.tipo)) errores.push("tipo: 'wifi' o 'movil'");
  if (!["", "3G", "4G", "5G"].includes(m?.tecnologia ?? "")) errores.push("tecnologia: '', '3G', '4G' o '5G'");
  if ((m?.x != null || m?.y != null) && (!numero(m?.x, 0, 1) || !numero(m?.y, 0, 1))) errores.push("x, y: entre 0 y 1, o null");
  if ((m?.lat != null || m?.lng != null) && (!numero(m?.lat, -90, 90) || !numero(m?.lng, -180, 180))) errores.push("lat, lng: coordenadas válidas, o null");
  if (m?.precision != null && !numero(m.precision, 0, 100000)) errores.push("precision: metros, número positivo o null");
  if (!numero(m?.latencia, 0, 60000)) errores.push("latencia: ms, número positivo");
  if (!numero(m?.jitter, 0, 60000)) errores.push("jitter: ms, número positivo");
  if (!numero(m?.perdida, 0, 100)) errores.push("perdida: entre 0 y 100");
  if (!numero(m?.descarga, 0, 100000)) errores.push("descarga: Mbps, número positivo");
  if (m?.subida != null && !numero(m.subida, 0, 100000)) errores.push("subida: Mbps, número positivo o null");
  if (m?.senal != null && !numero(m.senal, -130, -20)) errores.push("senal: dBm entre -130 y -20, o null");
  return errores;
}

app.get("/api/mediciones", sinCache, (_req, res) => {
  const filas = db.prepare("SELECT datos FROM mediciones ORDER BY fecha").all();
  res.json(filas.map((f) => JSON.parse(f.datos)));
});

app.post("/api/mediciones", express.json({ limit: "32kb" }), (req, res) => {
  const m = req.body;
  const errores = validar(m);
  if (errores.length) return res.status(400).json({ error: `Medición inválida. Revisa: ${errores.join("; ")}.` });
  // El servidor recalcula el puntaje: no se confía en el que manda el navegador
  const limpia = {
    id: typeof m.id === "string" && /^[\w-]{4,40}$/.test(m.id) ? m.id : `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`,
    fecha: !Number.isNaN(Date.parse(m.fecha)) ? new Date(m.fecha).toISOString() : new Date().toISOString(),
    lugar: m.lugar.trim(),
    tipo: m.tipo,
    tecnologia: m.tipo === "movil" ? m.tecnologia ?? "" : "",
    lat: m.lat ?? null,
    lng: m.lng ?? null,
    precision: m.precision ?? null,
    ...(m.ajustada && m.origen && numero(m.origen.lat, -90, 90) && numero(m.origen.lng, -180, 180) ? { ajustada: true, origen: { lat: m.origen.lat, lng: m.origen.lng } } : {}),
    x: m.x ?? null,
    y: m.y ?? null,
    latencia: m.latencia,
    jitter: m.jitter,
    perdida: m.perdida,
    descarga: m.descarga,
    subida: m.subida ?? null,
    senal: m.senal ?? null,
    ligera: Boolean(m.ligera),
    ejemplo: Boolean(m.ejemplo),
    servidor: ["api", "estatico", "simulado"].includes(m.servidor) ? m.servidor : "api",
    ...(m.navegador && typeof m.navegador === "object" ? { navegador: m.navegador } : {}),
  };
  limpia.estabilidad = estabilidad(limpia.jitter, limpia.perdida);
  limpia.puntaje = puntaje(limpia);
  db.prepare("INSERT OR REPLACE INTO mediciones (id, fecha, lugar, tipo, ejemplo, datos) VALUES (?, ?, ?, ?, ?, ?)").run(
    limpia.id,
    limpia.fecha,
    limpia.lugar,
    limpia.tipo,
    limpia.ejemplo ? 1 : 0,
    JSON.stringify(limpia),
  );
  res.status(201).json(limpia);
});

app.delete("/api/mediciones/:id", (req, res) => {
  const r = db.prepare("DELETE FROM mediciones WHERE id = ?").run(req.params.id);
  res.json({ borradas: r.changes });
});

// ?solo=ejemplos borra únicamente los datos de ejemplo
app.delete("/api/mediciones", (req, res) => {
  const r = req.query.solo === "ejemplos" ? db.prepare("DELETE FROM mediciones WHERE ejemplo = 1").run() : db.prepare("DELETE FROM mediciones").run();
  res.json({ borradas: r.changes });
});

app.get("/api/estadisticas", sinCache, (_req, res) => {
  const filas = db.prepare("SELECT tipo, COUNT(*) AS n, AVG(json_extract(datos, '$.puntaje')) AS puntaje FROM mediciones GROUP BY tipo").all();
  res.json(Object.fromEntries(filas.map((f) => [f.tipo, { mediciones: f.n, puntajePromedio: Math.round(f.puntaje) }])));
});

/* ---------- Interfaz ---------- */

app.use(express.static(join(raiz, "dist")));

app.listen(PUERTO, "0.0.0.0", () => {
  console.log(`NetScope en http://localhost:${PUERTO}`);
  console.log("Desde el celular, en la misma red Wi-Fi: http://<IP de este computador>:" + PUERTO);
});
