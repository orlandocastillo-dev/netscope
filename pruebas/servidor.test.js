// Pruebas del servidor y del puntaje. Se corren con: npm run prueba
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { categoria, estabilidad, puntaje } from "../src/lib/puntaje.ts";

const PUERTO = 3900 + Math.floor(Math.random() * 90);
const URL_BASE = `http://localhost:${PUERTO}`;
let proceso;

before(async () => {
  const db = join(mkdtempSync(join(tmpdir(), "netscope-")), "prueba.db");
  proceso = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server/index.js"], { env: { ...process.env, PORT: String(PUERTO), NETSCOPE_DB: db }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${URL_BASE}/api/estado`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("El servidor no arrancó");
});
after(() => proceso?.kill());

const medicion = {
  lugar: "Bloque 11",
  tipo: "wifi",
  tecnologia: "",
  lat: 10.9939,
  lng: -74.7926,
  precision: 12,
  x: null,
  y: null,
  latencia: 30,
  jitter: 4,
  perdida: 0,
  descarga: 40,
  subida: 15,
  senal: -60,
  ligera: false,
  ejemplo: false,
  servidor: "api",
};

test("estado y ping responden", async () => {
  const e = await (await fetch(`${URL_BASE}/api/estado`)).json();
  assert.equal(e.netscope, true);
  const p = await fetch(`${URL_BASE}/api/ping`);
  assert.equal(await p.text(), "ok");
  assert.match(p.headers.get("cache-control"), /no-store/);
});

test("la descarga entrega exactamente los bytes pedidos", async () => {
  const r = await fetch(`${URL_BASE}/api/descarga?mb=2`);
  const b = await r.arrayBuffer();
  assert.equal(b.byteLength, 2 * 1024 * 1024);
});

test("la subida cuenta los bytes recibidos", async () => {
  const r = await fetch(`${URL_BASE}/api/subida`, { method: "POST", body: new Uint8Array(512 * 1024) });
  assert.equal((await r.json()).bytes, 512 * 1024);
});

test("una medición válida se guarda con el puntaje calculado por el servidor", async () => {
  const r = await fetch(`${URL_BASE}/api/mediciones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...medicion, puntaje: 999 }) });
  assert.equal(r.status, 201);
  const m = await r.json();
  assert.equal(m.puntaje, puntaje(medicion));
  assert.notEqual(m.puntaje, 999);
  const lista = await (await fetch(`${URL_BASE}/api/mediciones`)).json();
  assert.ok(lista.some((x) => x.id === m.id));
});

test("una medición con datos incorrectos se rechaza con un mensaje claro", async () => {
  const r = await fetch(`${URL_BASE}/api/mediciones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...medicion, perdida: 140, senal: 10 }) });
  assert.equal(r.status, 400);
  const { error } = await r.json();
  assert.match(error, /perdida/);
  assert.match(error, /senal/);
});

test("borrar solo los ejemplos deja las mediciones reales", async () => {
  await fetch(`${URL_BASE}/api/mediciones`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...medicion, ejemplo: true }) });
  await fetch(`${URL_BASE}/api/mediciones?solo=ejemplos`, { method: "DELETE" });
  const lista = await (await fetch(`${URL_BASE}/api/mediciones`)).json();
  assert.ok(lista.length > 0 && lista.every((m) => !m.ejemplo));
});

test("puntaje: conexión excelente cerca de 100, muy mala cerca de 0", () => {
  assert.equal(puntaje({ latencia: 10, jitter: 1, perdida: 0, descarga: 200, subida: 50, senal: -40 }), 100);
  assert.equal(puntaje({ latencia: 400, jitter: 80, perdida: 10, descarga: 1, subida: 0.5, senal: -100 }), 0);
});

test("puntaje: sin señal ni subida, los pesos se reparten", () => {
  const con = puntaje({ latencia: 20, jitter: 3, perdida: 0, descarga: 50, subida: null, senal: null });
  assert.equal(con, 100);
});

test("categorías y estabilidad", () => {
  assert.equal(categoria(70), "buena");
  assert.equal(categoria(69), "regular");
  assert.equal(categoria(39), "baja");
  assert.equal(estabilidad(3, 0), 100);
  assert.equal(estabilidad(50, 5), 0);
});
