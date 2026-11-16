import { useEffect, useMemo, useRef, useState } from "react";
import { MapaReal, margen } from "../componentes/MapaReal";
import { Plano } from "../componentes/Plano";
import type { Mediciones } from "../lib/almacen";
import { colorCategoria, fecha, mbps, ms, nombreTipo, pct, promedios } from "../lib/formato";
import { categoria, NOMBRE_CATEGORIA } from "../lib/puntaje";
import type { Medicion } from "../lib/tipos";

type Filtro = "wifi" | "movil" | "todas";

/** Dentro de Claude las imágenes de otros sitios (las calles del mapa) no cargan: ahí se usa el plano. */
const hayMapaReal = () => !(window as unknown as { claude?: unknown }).claude;

export function Mapa({ datos, irAMedir }: { datos: Mediciones; irAMedir: () => void }) {
  const real = useMemo(hayMapaReal, []);
  // Con mapa real cuentan los puntos con GPS; sin él, los marcados en el plano
  const ubicables = useMemo(() => datos.lista.filter((m) => (real ? m.lat != null : m.x != null)), [datos.lista, real]);
  const lugares = useMemo(() => {
    const cuenta = new Map<string, number>();
    ubicables.forEach((m) => cuenta.set(m.lugar, (cuenta.get(m.lugar) ?? 0) + 1));
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  }, [ubicables]);
  const [lugar, setLugar] = useState<string>("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [activo, setActivo] = useState<Medicion | null>(null);
  const [editando, setEditando] = useState(false);

  // Se abre en el lugar con más mediciones, que es el que se ve bien de cerca.
  // En el mapa real se puede elegir "Todos"; en el plano hace falta un lugar.
  const elegido = useRef(false);
  useEffect(() => {
    if (lugar && !lugares.includes(lugar)) setLugar("");
    // En el mapa real se abre en "Todos"; el plano necesita un lugar
    if (!real && !lugar && lugares.length) setLugar(lugares[0]);
  }, [lugares, lugar, real]);

  const puntos = useMemo(
    () => ubicables.filter((m) => (!lugar || m.lugar === lugar) && (filtro === "todas" || m.tipo === filtro)),
    [ubicables, lugar, filtro],
  );
  const resumen = promedios(puntos);
  const mejor = puntos.reduce<Medicion | null>((a, m) => (!a || m.puntaje > a.puntaje ? m : a), null);
  const peor = puntos.reduce<Medicion | null>((a, m) => (!a || m.puntaje < a.puntaje ? m : a), null);
  const sinUbicar = datos.lista.length - ubicables.length;

  if (!ubicables.length)
    return <Vacio irAMedir={irAMedir} texto={datos.lista.length ? "Ninguna medición tiene ubicación todavía." : "Todavía no hay mediciones."} />;

  return (
    <div className="mapa">
      <section className="tarjeta mapa__principal">
        <div className="filtros">
          <label className="campo campo--linea">
            <span>Lugar</span>
            <select value={lugar} onChange={(e) => ((elegido.current = true), setLugar(e.target.value), setActivo(null))}>
              {real && <option value="">Todos</option>}
              {lugares.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <div className="segmentado segmentado--pequeno" role="radiogroup" aria-label="Tipo de conexión">
            {(["wifi", "movil", "todas"] as Filtro[]).map((f) => (
              <label key={f} className={filtro === f ? "activo" : undefined}>
                <input type="radio" name="filtro-mapa" checked={filtro === f} onChange={() => (setFiltro(f), setActivo(null))} />
                {f === "wifi" ? "Wi-Fi" : f === "movil" ? "Móvil" : "Todas"}
              </label>
            ))}
          </div>
        </div>
        {real ? (
          <MapaReal
            puntos={puntos}
            activo={activo?.id}
            editando={editando ? activo?.id : null}
            onTocarPunto={(m) => (setActivo(m), setEditando(false))}
            onMover={(m, lat, lng) => {
              const movida = { ...m, lat, lng, ajustada: true, origen: m.origen ?? { lat: m.lat!, lng: m.lng! } };
              setActivo(movida);
              datos.guardar(movida);
            }}
          />
        ) : (
          <Plano puntos={puntos} calor activo={activo?.id} onTocarPunto={setActivo} etiqueta={`Mapa de cobertura de ${lugar}`} />
        )}
        <ul className="leyenda" aria-label="Escala de colores">
          <li className="leyenda--buena">Buena, 70 o más</li>
          <li className="leyenda--regular">Regular, 40 a 69</li>
          <li className="leyenda--baja">Baja, menos de 40</li>
        </ul>
        <p className="nota">
          {real
            ? "Cada círculo es una medición en el sitio donde se hizo. El color entre puntos se estima por distancia inversa y se desvanece donde no se ha medido."
            : "El color entre puntos se estima por distancia inversa: cerca de un punto malo, la zona se ve mala. Donde no se ha medido, el mapa se desvanece."}
          {sinUbicar > 0 && ` ${sinUbicar} medición${sinUbicar === 1 ? "" : "es"} sin ubicación no aparece${sinUbicar === 1 ? "" : "n"} aquí, pero sí en el comparador.`}
        </p>
      </section>

      <aside className="mapa__lateral">
        {activo ? (
          <section className="tarjeta detalle">
            <div className="detalle__cabeza">
              <span className={`insignia pastilla--${categoria(activo.puntaje)}`}>{activo.puntaje}</span>
              <div>
                <strong>{nombreTipo(activo)}</strong>
                <small>{fecha(activo.fecha)}</small>
              </div>
              <button type="button" className="boton-icono" onClick={() => (setActivo(null), setEditando(false))} aria-label="Cerrar detalle">
                ×
              </button>
            </div>
            <dl className="cifras cifras--compactas">
              <div>
                <dt>Latencia</dt>
                <dd>{ms(activo.latencia)}</dd>
              </div>
              <div>
                <dt>Jitter</dt>
                <dd>{ms(activo.jitter)}</dd>
              </div>
              <div>
                <dt>Pérdida</dt>
                <dd>{pct(activo.perdida)}</dd>
              </div>
              <div>
                <dt>Descarga</dt>
                <dd>{mbps(activo.descarga)}</dd>
              </div>
              <div>
                <dt>Subida</dt>
                <dd>{mbps(activo.subida)}</dd>
              </div>
              <div>
                <dt>Señal</dt>
                <dd>{activo.senal == null ? "—" : `${activo.senal} dBm`}</dd>
              </div>
            </dl>
            {real && activo.lat != null && (
              <div className="ajuste">
                {editando ? (
                  <>
                    <p className="nota">
                      Arrastra el punto al lugar exacto donde mediste. Solo se mueve dentro del círculo: es el margen de error del GPS (±{margen(activo)} m).
                    </p>
                    <button type="button" className="pildora" onClick={() => setEditando(false)}>
                      Listo
                    </button>
                  </>
                ) : (
                  <>
                    <p className="nota">
                      {activo.ajustada ? "Punto ajustado a mano dentro del margen del GPS." : `El GPS ubicó esta medición con un margen de ±${margen(activo)} m. Adentro de una casa, cuartos vecinos pueden quedar casi en el mismo punto.`}
                    </p>
                    <button type="button" className="pildora pildora--suave" onClick={() => setEditando(true)}>
                      Ajustar el punto
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="tarjeta">
            <h2 className="tarjeta__titulo">{lugar || "Todos los lugares"}</h2>
            {puntos.length ? (
              <>
                <p className="grande" style={{ color: colorCategoria(resumen.puntaje) }}>
                  {Math.round(resumen.puntaje)}
                  <small> / 100 en promedio</small>
                </p>
                <ul className="lista-simple">
                  <li>
                    {puntos.length} punto{puntos.length === 1 ? "" : "s"} medido{puntos.length === 1 ? "" : "s"}
                  </li>
                  {mejor && <li>Mejor zona: {mejor.puntaje} ({NOMBRE_CATEGORIA[categoria(mejor.puntaje)].toLowerCase()})</li>}
                  {peor && <li>Peor zona: {peor.puntaje} ({NOMBRE_CATEGORIA[categoria(peor.puntaje)].toLowerCase()})</li>}
                  <li>Descarga promedio: {mbps(resumen.descarga)}</li>
                  <li>Latencia promedio: {ms(resumen.latencia)}</li>
                </ul>
                <p className="nota">Toca un punto del mapa para ver su detalle.</p>
              </>
            ) : (
              <p className="nota">No hay mediciones de este tipo{lugar ? ` en ${lugar}` : ""}.</p>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}

export function Vacio({ irAMedir, texto = "Todavía no hay mediciones." }: { irAMedir: () => void; texto?: string }) {
  return (
    <section className="tarjeta vacio">
      <h2>{texto}</h2>
      <p>Haz tu primera prueba en la pestaña Medir, o carga los datos de ejemplo desde el Historial para ver cómo funciona.</p>
      <button type="button" className="boton" onClick={irAMedir}>
        Ir a medir
      </button>
    </section>
  );
}
