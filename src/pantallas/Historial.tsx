import { useEffect, useMemo, useRef, useState } from "react";
import type { Mediciones } from "../lib/almacen";
import { datosDeEjemplo } from "../lib/ejemplo";
import { csv, fecha, mbps, ms, nombreTipo, pct } from "../lib/formato";
import type { Medicion } from "../lib/tipos";
import { Puntos } from "./Comparar";

type Descargas = { save(o: { filename: string; data: string }): Promise<unknown> };

/** Descarga de archivos: en Claude con la capacidad `downloads`; fuera de Claude, un enlace normal. */
function useDescargas() {
  const [d, setD] = useState<Descargas | null | "navegador">(null);
  useEffect(() => {
    const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
    if (!c?.use) return setD("navegador");
    c.use("downloads")
      .then((x) => setD((x as Descargas) ?? null))
      .catch(() => setD(null));
  }, []);
  return d;
}

function Grafica({ lista }: { lista: Medicion[] }) {
  // El dibujo usa el ancho real del contenedor: así el texto queda del mismo tamaño en celular y computador
  const caja = useRef<HTMLElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [lista.length >= 2]);
  const H = W < 500 ? 190 : 230;
  const m = { i: 34, d: 12, a: 12, b: 26 };
  if (lista.length < 2) return <p className="nota">La gráfica aparece cuando haya al menos dos mediciones.</p>;
  const t0 = new Date(lista[0].fecha).getTime();
  const t1 = new Date(lista[lista.length - 1].fecha).getTime();
  const x = (iso: string) => m.i + ((new Date(iso).getTime() - t0) / Math.max(1, t1 - t0)) * (W - m.i - m.d);
  const y = (p: number) => m.a + (1 - p / 100) * (H - m.a - m.b);
  const serie = (tipo: "wifi" | "movil") => lista.filter((l) => l.tipo === tipo);
  const linea = (ps: Medicion[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.fecha).toFixed(1)},${y(p.puntaje).toFixed(1)}`).join(" ");
  return (
    <figure className="grafica" ref={caja}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del puntaje en el tiempo">
        {[0, 40, 70, 100].map((v) => (
          <g key={v}>
            <line x1={m.i} x2={W - m.d} y1={y(v)} y2={y(v)} className={v === 40 || v === 70 ? "grafica__umbral" : "grafica__eje"} />
            <text x={m.i - 6} y={y(v) + 4} className="grafica__texto" textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {(["wifi", "movil"] as const).map((t) => (
          <g key={t} className={`grafica__serie grafica__serie--${t}`}>
            <path d={linea(serie(t))} />
            {serie(t).map((p) => (
              <circle key={p.id} cx={x(p.fecha)} cy={y(p.puntaje)} r={3.5}>
                <title>{`${nombreTipo(p)} · ${p.lugar} · ${p.puntaje} pts`}</title>
              </circle>
            ))}
          </g>
        ))}
        <text x={m.i} y={H - 6} className="grafica__texto">
          {fecha(lista[0].fecha)}
        </text>
        <text x={W - m.d} y={H - 6} className="grafica__texto" textAnchor="end">
          {fecha(lista[lista.length - 1].fecha)}
        </text>
      </svg>
      <figcaption className="leyenda-series">
        <span className="leyenda-series__wifi">Wi-Fi</span>
        <span className="leyenda-series__movil">Datos móviles</span>
        <span>Guías en 40 (regular) y 70 (buena)</span>
      </figcaption>
    </figure>
  );
}

export function Historial({ datos }: { datos: Mediciones }) {
  const descargas = useDescargas();
  const [confirmar, setConfirmar] = useState<null | "ejemplos" | "todo">(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lugar, setLugar] = useState("");
  const lugares = useMemo(() => [...new Set(datos.lista.map((m) => m.lugar))].sort(), [datos.lista]);
  const lista = useMemo(() => datos.lista.filter((m) => !lugar || m.lugar === lugar), [datos.lista, lugar]);
  const ejemplos = datos.lista.filter((m) => m.ejemplo);

  const hacer = async (f: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await f();
      setAviso(ok);
    } catch (e) {
      const msg = (e as { code?: string; message?: string }).code === "quota_exceeded" ? "La base de datos está llena: borra mediciones antiguas." : (e as Error).message;
      setAviso(`No se pudo: ${msg}`);
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  };

  const exportar = async () => {
    const texto = csv(lista);
    const nombre = `netscope-${new Date().toISOString().slice(0, 10)}.csv`;
    if (descargas === "navegador") {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (descargas) {
      try {
        await descargas.save({ filename: nombre, data: "﻿" + texto });
      } catch {
        setAviso("La descarga se canceló.");
      }
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(csv(lista));
      setAviso("CSV copiado. Pégalo en Excel o en Google Sheets.");
    } catch {
      setAviso("No se pudo copiar en este navegador.");
    }
  };

  const [todas, setTodas] = useState(false);
  const recientes = [...lista].reverse().slice(0, todas ? undefined : 30);

  return (
    <div className="historial">
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
          <div className="acciones">
            {descargas && (
              <button type="button" className="boton boton--secundario" onClick={exportar} disabled={!lista.length}>
                Exportar CSV
              </button>
            )}
            <button type="button" className="boton boton--secundario" onClick={copiar} disabled={!lista.length}>
              Copiar CSV
            </button>
          </div>
        </div>
        <Grafica lista={lista} />
      </section>

      <section className="tarjeta">
        <div className="tarjeta__cabeza">
          <h2 className="tarjeta__titulo">Mediciones ({lista.length})</h2>
          <div className="acciones">
            {ejemplos.length === 0 ? (
              <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => hacer(() => datos.guardarVarias(datosDeEjemplo()), "Datos de ejemplo cargados: mira el Mapa y el comparador.")}>
                Cargar datos de ejemplo
              </button>
            ) : (
              <button type="button" className="boton boton--secundario" disabled={ocupado} onClick={() => setConfirmar("ejemplos")}>
                Borrar ejemplos ({ejemplos.length})
              </button>
            )}
            <button type="button" className="boton boton--peligro" disabled={ocupado || !datos.lista.length} onClick={() => setConfirmar("todo")}>
              Borrar todo
            </button>
          </div>
        </div>

        {confirmar && (
          <div className="confirmar" role="alertdialog" aria-labelledby="t-confirmar">
            <p id="t-confirmar">
              {confirmar === "todo"
                ? `¿Borrar las ${datos.lista.length} mediciones? No se puede deshacer.`
                : `¿Borrar las ${ejemplos.length} mediciones de ejemplo? Las tuyas se quedan.`}
            </p>
            <div className="acciones">
              <button type="button" className="boton boton--secundario" onClick={() => setConfirmar(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--peligro"
                disabled={ocupado}
                onClick={() =>
                  confirmar === "todo"
                    ? hacer(() => datos.borrarVarias(datos.lista.map((m) => m.id)), "Se borraron todas las mediciones.")
                    : hacer(() => datos.borrarVarias(ejemplos.map((m) => m.id)), "Se borraron los datos de ejemplo.")
                }
              >
                Sí, borrar
              </button>
            </div>
          </div>
        )}
        {ocupado && <p className="nota">Guardando…</p>}
        {aviso && <p className="nota nota--aviso">{aviso}</p>}

        {recientes.length ? (
          <ul className="registros">
            {recientes.map((m) => (
              <li key={m.id} className="registro">
                <Puntos v={m.puntaje} />
                <div className="registro__texto">
                  <p className="registro__lugar">
                    {m.lugar}
                    {m.ejemplo && <span className="etiqueta">ejemplo</span>}
                  </p>
                  <p className="registro__meta">
                    {nombreTipo(m)} · {fecha(m.fecha)}
                  </p>
                </div>
                <dl className="registro__cifras">
                  <div>
                    <dt>Latencia</dt>
                    <dd>{ms(m.latencia)}</dd>
                  </div>
                  <div>
                    <dt>Jitter</dt>
                    <dd>{ms(m.jitter)}</dd>
                  </div>
                  <div>
                    <dt>Pérdida</dt>
                    <dd>{pct(m.perdida)}</dd>
                  </div>
                  <div>
                    <dt>Descarga</dt>
                    <dd>{mbps(m.descarga)}</dd>
                  </div>
                  <div>
                    <dt>Subida</dt>
                    <dd>{mbps(m.subida)}</dd>
                  </div>
                </dl>
                <button type="button" className="boton-icono registro__borrar" aria-label={`Borrar medición de ${m.lugar}`} onClick={() => hacer(() => datos.borrar(m.id), "Medición borrada.")} disabled={ocupado}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nota">Todavía no hay mediciones. Haz una prueba en Medir o carga los datos de ejemplo.</p>
        )}
        {lista.length > 30 && (
          <button type="button" className="boton boton--secundario mostrar-todas" onClick={() => setTodas(!todas)}>
            {todas ? "Mostrar solo las 30 más recientes" : `Mostrar las ${lista.length} mediciones`}
          </button>
        )}
      </section>
    </div>
  );
}
