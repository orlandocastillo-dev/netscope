import { useEffect, useMemo, useState } from "react";
import { Medidor, Traza } from "../componentes/Medidor";
import { Plano } from "../componentes/Plano";
import { completar, type Mediciones } from "../lib/almacen";
import { colorCategoria, dbm, mbps, ms, pct } from "../lib/formato";
import { infoNavegador, medirRed, type Fase, type Progreso } from "../lib/medicion";
import { categoria, explicaciones, NOMBRE_CATEGORIA } from "../lib/puntaje";
import type { ServidorPruebas } from "../lib/servidor";
import type { Medicion, Tecnologia, TipoRed } from "../lib/tipos";
import { encenderSiHayPermiso, gps, MENSAJE_UBICACION, pasosPermiso, ubicacionDisponible, type ErrorUbicacion, type Ubicacion } from "../lib/ubicacion";

const NOMBRE_FASE: Record<Fase, string> = {
  preparando: "Preparando",
  latencia: "Midiendo latencia",
  descarga: "Midiendo descarga",
  subida: "Midiendo subida",
  listo: "Listo",
};

const PREFS = "netscope:preferencias";

function leerPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? "{}") as { lugar?: string };
  } catch {
    return {};
  }
}


export function Medir({ datos, servidor }: { datos: Mediciones; servidor: ServidorPruebas | null }) {
  const prefs = useMemo(leerPrefs, []);
  const red = useMemo(infoNavegador, []);
  const conGps = useMemo(ubicacionDisponible, []);
  const detectada: TipoRed | null = red?.tipo === "cellular" ? "movil" : red?.tipo === "wifi" ? "wifi" : null;

  const [tipo, setTipo] = useState<TipoRed>(detectada ?? "wifi");
  const [tecnologia, setTecnologia] = useState<Tecnologia>("");
  const [lugar, setLugar] = useState(prefs.lugar ?? "");
  const [senal, setSenal] = useState("");
  const [ligera, setLigera] = useState(detectada === "movil");
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null);
  const [posicion, setPosicion] = useState<Ubicacion | null>(null);
  const [errorGps, setErrorGps] = useState<ErrorUbicacion | null>(null);
  const [gpsPedido, setGpsPedido] = useState(false);
  const [esperandoGps, setEsperandoGps] = useState(false);
  const [preguntando, setPreguntando] = useState(false);
  const [nombre, setNombre] = useState(prefs.lugar ?? "");
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [pings, setPings] = useState<number[]>([]);
  const [curva, setCurva] = useState<number[]>([]);
  const [resultado, setResultado] = useState<Medicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consumo, setConsumo] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState(false);

  useEffect(() => {
    if (tipo === "movil") setLigera(true);
  }, [tipo]);

  // El GPS se enciende solo si ya había permiso; si no, al primer toque de "Medir"
  useEffect(() => {
    if (!conGps) return;
    encenderSiHayPermiso();
    return gps.escuchar((u, e) => {
      setPosicion(u);
      setErrorGps(e);
      if (u || e) setGpsPedido(true);
    });
  }, [conGps]);

  // Lugares usados, del más reciente al más antiguo
  const lugares = useMemo(() => [...new Set([...datos.lista].reverse().map((m) => m.lugar))], [datos.lista]);
  const lugarFinal = lugar.trim() || "Sin nombre";
  const delLugar = useMemo(() => datos.lista.filter((m) => m.lugar === lugarFinal && m.x != null), [datos.lista, lugarFinal]);
  const midiendo = (progreso != null && progreso.fase !== "listo") || esperandoGps;
  const senalNum = senal.trim() === "" ? null : Number(senal);
  const senalMala = senalNum != null && (!Number.isFinite(senalNum) || senalNum > -20 || senalNum < -130);
  // Sin GPS (por ejemplo, dentro de Claude) hace falta marcar el punto en el plano
  const falta = !servidor ? "Preparando el servidor de pruebas…" : !conGps && !punto ? "Marca abajo, en el plano, dónde estás." : senalMala ? "Revisa la intensidad de señal en los ajustes." : null;

  /** Primer toque: se pregunta el lugar y, en el mismo toque, se enciende el GPS (así el navegador pide permiso). */
  const preguntar = () => {
    if (falta) return;
    if (conGps) {
      gps.iniciar();
      setGpsPedido(true);
    }
    setNombre(lugar || prefs.lugar || "");
    setPreguntando(true);
  };

  const avisar = (p: Progreso) => {
    setProgreso(p);
    if (p.fase === "latencia" && p.valor != null) setPings((x) => [...x, p.valor!]);
    if (p.fase === "descarga" && p.valor != null) setCurva((x) => [...x, p.valor!]);
  };

  const empezar = async (nombreLugar: string) => {
    if (falta || !servidor) return;
    setPreguntando(false);
    setLugar(nombreLugar);
    setError(null);
    setResultado(null);
    setPings([]);
    setCurva([]);
    setAjustes(false);
    try {
      localStorage.setItem(PREFS, JSON.stringify({ lugar: nombreLugar }));
    } catch {
      /* sin almacenamiento local, no pasa nada */
    }
    try {
      // La prueba y el GPS corren a la vez; si la prueba termina primero, se espera al GPS (hasta 30 s)
      const esperaGps = conGps ? gps.esperar(30000) : Promise.resolve(null);
      const r = await medirRed(servidor, ligera, avisar);
      if (conGps && !gps.actual()) setEsperandoGps(true);
      const u = await esperaGps;
      setEsperandoGps(false);
      const m = completar({
        lugar: nombreLugar,
        tipo,
        tecnologia: tipo === "movil" ? tecnologia : "",
        lat: u?.lat ?? null,
        lng: u?.lng ?? null,
        precision: u?.precision ?? null,
        x: u ? null : punto?.x ?? null,
        y: u ? null : punto?.y ?? null,
        latencia: Math.round(r.latencia * 10) / 10,
        jitter: Math.round(r.jitter * 10) / 10,
        perdida: Math.round(r.perdida * 10) / 10,
        descarga: Math.round(r.descarga * 10) / 10,
        subida: r.subida == null ? null : Math.round(r.subida * 10) / 10,
        senal: senalNum,
        ligera,
        ejemplo: false,
        servidor: servidor.tipo,
        ...(red ? { navegador: red } : {}),
      });
      setConsumo(r.consumo);
      setResultado(m);
      try {
        await datos.guardar(m);
      } catch (e) {
        setError(`La medición se hizo, pero no se pudo guardar: ${(e as Error).message}`);
      }
    } catch (e) {
      setProgreso(null);
      setError((e as Error).message);
    }
  };

  const valorVivo = progreso && progreso.fase !== "listo" ? progreso.valor ?? null : null;
  const hallazgos = resultado ? explicaciones(resultado) : [];
  const nombreConexion = tipo === "wifi" ? "Wi-Fi" : `Datos móviles${tecnologia ? ` ${tecnologia}` : ""}`;
  const textoUbicacion = !conGps
    ? punto
      ? "Marcada en el plano"
      : "Márcala en el plano"
    : posicion
      ? `Lista, ±${posicion.precision} m`
      : errorGps === "denegada"
        ? "Sin permiso"
        : gpsPedido
          ? "Buscando…"
          : "Se activa al medir";

  return (
    <div className="medir">
      <section className="instrumento" aria-labelledby="t-medir" aria-live="polite">
        <h2 id="t-medir" className="solo-lector">
          Medir la conexión
        </h2>
        {resultado && !midiendo ? (
          <>
            <Medidor valor={resultado.puntaje} etiqueta={`Calidad ${NOMBRE_CATEGORIA[categoria(resultado.puntaje)].toLowerCase()}`} tono={colorCategoria(resultado.puntaje)} />
            <p className="hallazgo">{hallazgos[0].texto}</p>
          </>
        ) : (
          <Medidor
            valor={valorVivo}
            maximo={progreso?.unidad === "ms" ? 300 : 100}
            etiqueta={esperandoGps ? "Buscando tu ubicación…" : progreso ? NOMBRE_FASE[progreso.fase] : "¿Qué tan buena es la conexión aquí?"}
            unidad={progreso?.unidad}
            tono={progreso ? "var(--text)" : undefined}
          />
        )}
        {(midiendo || resultado) && <Traza pings={pings} descarga={curva} />}
        {error && <p className="alerta">{error}</p>}
        <button type="button" className="pildora pildora--grande" onClick={preguntar} disabled={!!falta || midiendo}>
          {midiendo ? "Midiendo…" : resultado ? "Medir otra vez" : "Medir mi conexión"}
        </button>
        {falta && !midiendo && <p className="ayuda centro">{falta}</p>}
        {esperandoGps && <p className="ayuda centro">La prueba terminó. Esperando al GPS para ubicar la medición en el mapa (hasta 30 s).</p>}
        {resultado && !midiendo && conGps && resultado.lat == null && (
          <p className="alerta">
            Se guardó sin ubicación, así que no aparece en el mapa. {errorGps === "denegada" ? "Abajo, en «Esta prueba», están los pasos para activarla." : MENSAJE_UBICACION["sin-senal"]}
          </p>
        )}
      </section>

      {resultado && !midiendo && (
        <section className="bloque" aria-labelledby="t-cifras">
          <h2 id="t-cifras" className="bloque__titulo">
            Resultado
          </h2>
          <dl className="filas">
            <Fila nombre="Latencia" valor={ms(resultado.latencia)} />
            <Fila nombre="Jitter" valor={ms(resultado.jitter)} />
            <Fila nombre="Pérdida" valor={pct(resultado.perdida)} />
            <Fila nombre="Descarga" valor={mbps(resultado.descarga)} />
            <Fila nombre="Subida" valor={resultado.subida == null ? "No se mide aquí" : mbps(resultado.subida)} tenue={resultado.subida == null} />
            <Fila nombre="Estabilidad" valor={`${resultado.estabilidad} %`} />
            {resultado.senal != null && <Fila nombre="Señal" valor={dbm(resultado.senal)} />}
          </dl>
          {hallazgos.length > 1 && (
            <ul className="avisos">
              {hallazgos.slice(1).map((e) => (
                <li key={e.texto} className={`aviso aviso--${e.tono}`}>
                  {e.texto}
                </li>
              ))}
            </ul>
          )}
          {consumo != null && <p className="nota">Usó {consumo.toFixed(1)} MB de datos y quedó guardada en el historial.</p>}
        </section>
      )}

      <section className="bloque" aria-labelledby="t-prueba">
        <div className="bloque__cabeza">
          <h2 id="t-prueba" className="bloque__titulo">
            Esta prueba
          </h2>
          <button type="button" className="enlace" onClick={() => setAjustes(!ajustes)} aria-expanded={ajustes} disabled={midiendo}>
            {ajustes ? "Listo" : "Ajustar"}
          </button>
        </div>
        <dl className="filas">
          <Fila nombre="Conexión" valor={nombreConexion} nota={detectada === tipo ? "detectada" : undefined} />
          <Fila nombre="Ubicación" valor={textoUbicacion} />
          <Fila nombre="Lugar" valor={lugarFinal} />
          <Fila nombre="Tipo de prueba" valor={ligera ? "Ligera, ~1,5 MB" : servidor?.subida ? "Normal, ~7 MB" : "Normal, ~5 MB"} />
        </dl>
        {errorGps === "denegada" && <AyudaPermiso />}
        {posicion && posicion.precision > 40 && <p className="nota">El GPS está impreciso (±{posicion.precision} m). En interiores pasa seguido: acércate a una ventana.</p>}

        {ajustes && (
          <div className="ajustes">
            <fieldset className="campo">
              <legend>Conexión</legend>
              <div className="segmentado" role="radiogroup">
                {(["wifi", "movil"] as TipoRed[]).map((t) => (
                  <label key={t} className={tipo === t ? "activo" : undefined}>
                    <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} />
                    {t === "wifi" ? "Wi-Fi" : "Datos móviles"}
                  </label>
                ))}
              </div>
              {!detectada && <small className="ayuda">Este navegador no dice qué conexión usas: elígela tú.</small>}
            </fieldset>
            {tipo === "movil" && (
              <fieldset className="campo">
                <legend>Tecnología de la red</legend>
                <div className="segmentado" role="radiogroup">
                  {(["", "3G", "4G", "5G"] as Tecnologia[]).map((t) => (
                    <label key={t || "nose"} className={tecnologia === t ? "activo" : undefined}>
                      <input type="radio" name="tec" checked={tecnologia === t} onChange={() => setTecnologia(t)} />
                      {t || "No sé"}
                    </label>
                  ))}
                </div>
                <small className="ayuda">Míralo en la barra de estado del celular.</small>
              </fieldset>
            )}
            <label className="campo">
              <span>Nombre del lugar</span>
              <input list="lugares" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Casa, Bloque 11, Biblioteca…" maxLength={60} />
              <datalist id="lugares">
                {lugares.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </label>
            <label className="campo">
              <span>Intensidad de señal (opcional)</span>
              <div className="con-unidad">
                <input inputMode="numeric" value={senal} onChange={(e) => setSenal(e.target.value.replace(/[^\d-]/g, ""))} placeholder="-65" aria-invalid={senalMala} />
                <span>dBm</span>
              </div>
              <small className={senalMala ? "ayuda ayuda--error" : "ayuda"}>
                {senalMala ? "Debe ser un número negativo, entre -130 y -20." : "En Android: Ajustes › Acerca del teléfono › Estado."}
              </small>
            </label>
            <label className="interruptor">
              <input type="checkbox" checked={ligera} onChange={(e) => setLigera(e.target.checked)} />
              <span>
                Prueba ligera
                <small>Gasta menos datos. Ideal con datos móviles.</small>
              </span>
            </label>
          </div>
        )}
      </section>

      {preguntando && (
        <div className="hoja-fondo" onClick={() => setPreguntando(false)}>
          <form
            className="hoja"
            role="dialog"
            aria-modal="true"
            aria-labelledby="t-donde"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (nombre.trim()) empezar(nombre.trim());
            }}
          >
            <h2 id="t-donde" className="hoja__titulo">
              ¿Dónde estás midiendo?
            </h2>
            <p className="hoja__texto">Ponle nombre al lugar para agruparlo en el mapa y compararlo después.</p>
            <input
              className="hoja__campo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Casa, Bloque 11, Biblioteca…"
              maxLength={60}
              autoFocus
              aria-label="Nombre del lugar"
            />
            {lugares.length > 0 && (
              <div className="sugerencias" aria-label="Lugares usados antes">
                {lugares.slice(0, 6).map((l) => (
                  <button key={l} type="button" className={l === nombre.trim() ? "sugerencia sugerencia--activa" : "sugerencia"} onClick={() => setNombre(l)}>
                    {l}
                  </button>
                ))}
              </div>
            )}
            <div className="segmentado hoja__conexion" role="radiogroup" aria-label="Conexión">
              {(["wifi", "movil"] as TipoRed[]).map((t) => (
                <label key={t} className={tipo === t ? "activo" : undefined}>
                  <input type="radio" name="tipo-hoja" checked={tipo === t} onChange={() => setTipo(t)} />
                  {t === "wifi" ? "Wi-Fi" : "Datos móviles"}
                </label>
              ))}
            </div>
            {conGps && errorGps === "denegada" ? (
              <AyudaPermiso />
            ) : conGps ? (
              <p className="hoja__gps">{posicion ? `Ubicación lista (±${posicion.precision} m)` : "Buscando tu ubicación… Si el navegador te pregunta, toca Permitir."}</p>
            ) : null}
            <button type="submit" className="pildora pildora--grande" disabled={!nombre.trim()}>
              Medir aquí
            </button>
            <button type="button" className="enlace hoja__cancelar" onClick={() => setPreguntando(false)}>
              Cancelar
            </button>
          </form>
        </div>
      )}

      {!conGps && (
        <section className="bloque" aria-labelledby="t-punto">
          <h2 id="t-punto" className="bloque__titulo">
            Marca dónde estás
          </h2>
          <p className="nota nota--arriba">En esta versión el navegador no deja usar el GPS. Toca la zona del plano donde estás parado.</p>
          <Plano puntos={delLugar} seleccion={punto} onElegir={midiendo ? undefined : setPunto} etiqueta="Plano del lugar para marcar el punto de medición" />
        </section>
      )}
    </div>
  );
}

/** Qué hacer cuando el celular niega la ubicación sin preguntar: pasos para su sistema y navegador. */
function AyudaPermiso() {
  return (
    <div className="permiso">
      <p className="permiso__titulo">{MENSAJE_UBICACION.denegada}</p>
      <p className="permiso__texto">Actívala así (toma un minuto):</p>
      <ol className="permiso__pasos">
        {pasosPermiso().map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
      <button type="button" className="pildora pildora--suave" onClick={() => gps.reintentar()}>
        Intentar de nuevo
      </button>
      <p className="permiso__texto">Si mides sin ubicación, la medición se guarda igual pero no aparece en el mapa.</p>
    </div>
  );
}

function Fila({ nombre, valor, nota, tenue }: { nombre: string; valor: string; nota?: string; tenue?: boolean }) {
  return (
    <div className="fila">
      <dt>{nombre}</dt>
      <dd className={tenue ? "tenue" : undefined}>
        {valor}
        {nota && <small>{nota}</small>}
      </dd>
    </div>
  );
}
