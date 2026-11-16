import { useMemo, useState } from "react";
import type { Mediciones } from "../lib/almacen";
import { colorPuntaje, mbps, ms, pct, promedios } from "../lib/formato";
import type { Medicion } from "../lib/tipos";
import { Vacio } from "./Mapa";

type Prom = ReturnType<typeof promedios>;

const PARAMETROS: { clave: keyof Prom; nombre: string; formato: (v: number) => string; mayorEsMejor: boolean }[] = [
  { clave: "puntaje", nombre: "Puntaje", formato: (v) => String(Math.round(v)), mayorEsMejor: true },
  { clave: "descarga", nombre: "Descarga", formato: (v) => mbps(v), mayorEsMejor: true },
  { clave: "subida", nombre: "Subida", formato: (v) => mbps(v), mayorEsMejor: true },
  { clave: "latencia", nombre: "Latencia", formato: ms, mayorEsMejor: false },
  { clave: "jitter", nombre: "Jitter", formato: ms, mayorEsMejor: false },
  { clave: "perdida", nombre: "Pérdida", formato: pct, mayorEsMejor: false },
  { clave: "estabilidad", nombre: "Estabilidad", formato: (v) => `${Math.round(v)} %`, mayorEsMejor: true },
];

/** Si la diferencia de puntaje es menor a 5, se considera similar. */
function veredicto(w: Prom, m: Prom) {
  if (!w.n || !m.n) return null;
  const dif = w.puntaje - m.puntaje;
  if (Math.abs(dif) < 5) return { ganador: "similar" as const, texto: `Wi-Fi y datos móviles rinden parecido (diferencia de ${Math.abs(dif).toFixed(0)} puntos).` };
  return dif > 0
    ? { ganador: "wifi" as const, texto: `Aquí conviene el Wi-Fi: saca ${dif.toFixed(0)} puntos más que los datos móviles.` }
    : { ganador: "movil" as const, texto: `Aquí conviene usar los datos móviles: sacan ${(-dif).toFixed(0)} puntos más que el Wi-Fi.` };
}

export function Comparar({ datos, irAMedir }: { datos: Mediciones; irAMedir: () => void }) {
  const lugares = useMemo(() => [...new Set(datos.lista.map((m) => m.lugar))].sort(), [datos.lista]);
  const [lugar, setLugar] = useState("");
  const lista = useMemo(() => datos.lista.filter((m) => !lugar || m.lugar === lugar), [datos.lista, lugar]);
  const wifi = promedios(lista.filter((m) => m.tipo === "wifi"));
  const movil = promedios(lista.filter((m) => m.tipo === "movil"));
  const v = veredicto(wifi, movil);

  const porTecnologia = useMemo(() => {
    const grupos = new Map<string, Medicion[]>();
    lista.filter((m) => m.tipo === "movil").forEach((m) => {
      const k = m.tecnologia || "Sin indicar";
      grupos.set(k, [...(grupos.get(k) ?? []), m]);
    });
    return [...grupos.entries()].sort().map(([k, ms]) => ({ k, p: promedios(ms) }));
  }, [lista]);

  const porLugar = useMemo(
    () =>
      lugares.map((l) => {
        const w = promedios(datos.lista.filter((m) => m.lugar === l && m.tipo === "wifi"));
        const m = promedios(datos.lista.filter((x) => x.lugar === l && x.tipo === "movil"));
        return { l, w, m, v: veredicto(w, m) };
      }),
    [datos.lista, lugares],
  );

  if (!datos.lista.length) return <Vacio irAMedir={irAMedir} />;

  return (
    <div className="comparar">
      <section className="tarjeta">
        <div className="filtros">
          <label className="campo campo--linea">
            <span>Lugar</span>
            <select value={lugar} onChange={(e) => setLugar(e.target.value)}>
              <option value="">Todos los lugares</option>
              {lugares.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={`veredicto veredicto--${v?.ganador ?? "nada"}`}>
          {v ? (
            <p>{v.texto}</p>
          ) : (
            <p>Para comparar hace falta medir con los dos: Wi-Fi ({wifi.n}) y datos móviles ({movil.n}).</p>
          )}
        </div>

        <div className="duelo" role="table" aria-label="Promedios de Wi-Fi y datos móviles">
          <div className="duelo__fila duelo__fila--cabeza" role="row">
            <span role="columnheader">Parámetro</span>
            <span role="columnheader">Wi-Fi · {wifi.n}</span>
            <span role="columnheader">Móvil · {movil.n}</span>
          </div>
          {PARAMETROS.map((p) => {
            const a = wifi[p.clave];
            const b = movil[p.clave];
            const hay = Number.isFinite(a) && Number.isFinite(b);
            const gana = !hay || a === b ? null : (a > b) === p.mayorEsMejor ? "wifi" : "movil";
            const max = Math.max(Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0) || 1;
            const barra = (val: number, quien: "wifi" | "movil") => (
              <span role="cell" className={`duelo__celda${gana === quien ? " duelo__celda--gana" : ""}`}>
                <span className="duelo__valor">{Number.isFinite(val) ? p.formato(val) : "—"}</span>
                <span className={`duelo__barra duelo__barra--${quien}`}>
                  <i style={{ width: `${Number.isFinite(val) ? Math.max(3, (val / max) * 100) : 0}%` }} />
                </span>
              </span>
            );
            return (
              <div className="duelo__fila" role="row" key={p.clave}>
                <span role="rowheader">
                  {p.nombre}
                  <small>{p.mayorEsMejor ? "más es mejor" : "menos es mejor"}</small>
                </span>
                {barra(a, "wifi")}
                {barra(b, "movil")}
              </div>
            );
          })}
        </div>
      </section>

      <div className="comparar__tablas">
        <section className="tarjeta">
          <h2 className="tarjeta__titulo">Datos móviles por tecnología</h2>
          {porTecnologia.length ? (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Red</th>
                  <th>Mediciones</th>
                  <th>Puntaje</th>
                  <th>Descarga</th>
                  <th>Latencia</th>
                </tr>
              </thead>
              <tbody>
                {porTecnologia.map(({ k, p }) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{p.n}</td>
                    <td>
                      <Puntos v={p.puntaje} />
                    </td>
                    <td>{mbps(p.descarga)}</td>
                    <td>{ms(p.latencia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="nota">Aún no hay mediciones con datos móviles.</p>
          )}
        </section>

        <section className="tarjeta">
          <h2 className="tarjeta__titulo">Por lugar</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Lugar</th>
                <th>Wi-Fi</th>
                <th>Móvil</th>
                <th>Conviene</th>
              </tr>
            </thead>
            <tbody>
              {porLugar.map(({ l, w, m, v }) => (
                <tr key={l}>
                  <td>{l}</td>
                  <td>{w.n ? <Puntos v={w.puntaje} /> : "—"}</td>
                  <td>{m.n ? <Puntos v={m.puntaje} /> : "—"}</td>
                  <td>{v ? (v.ganador === "similar" ? "Similar" : v.ganador === "wifi" ? "Wi-Fi" : "Móvil") : "Faltan datos"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

export const Puntos = ({ v }: { v: number }) => (
  <span className="puntos" style={{ background: colorPuntaje(v) }}>
    {Math.round(v)}
  </span>
);
