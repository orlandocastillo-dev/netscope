import { useEffect, useMemo, useState } from "react";
import { Medidor } from "../componentes/Medidor";
import { Plano } from "../componentes/Plano";
import { completar, type Mediciones } from "../lib/almacen";
import { dbm, mbps, ms, pct } from "../lib/formato";
import { infoNavegador, medirRed, type Fase, type Progreso } from "../lib/medicion";
import { categoria, explicaciones, NOMBRE_CATEGORIA } from "../lib/puntaje";
import type { ServidorPruebas } from "../lib/servidor";
import type { Medicion, Tecnologia, TipoRed } from "../lib/tipos";
import { MENSAJE_UBICACION, obtenerUbicacion, ubicacionDisponible, type ErrorUbicacion, type Ubicacion } from "../lib/ubicacion";

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

type EstadoUbicacion = { estado: "esperando" } | { estado: "buscando" } | { estado: "lista"; u: Ubicacion } | { estado: "error"; e: ErrorUbicacion };

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
  const [ubic, setUbic] = useState<EstadoUbicacion>({ estado: "esperando" });
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<Medicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consumo, setConsumo] = useState<number | null>(null);

  useEffect(() => {
    if (tipo === "movil") setLigera(true);
  }, [tipo]);

  const lugares = useMemo(() => [...new Set(datos.lista.map((m) => m.lugar))].sort(), [datos.lista]);
  const lugarFinal = lugar.trim() || (conGps ? "Sin nombre" : "Mi espacio");
  const delLugar = useMemo(() => datos.lista.filter((m) => m.lugar === lugarFinal && m.x != null), [datos.lista, lugarFinal]);
  const midiendo = progreso != null && progreso.fase !== "listo";
  const senalNum = senal.trim() === "" ? null : Number(senal);
  const senalMala = senalNum != null && (!Number.isFinite(senalNum) || senalNum > -20 || senalNum < -130);
  // Sin GPS (por ejemplo, dentro de Claude) hace falta marcar el punto en el plano
  const falta = !servidor ? "Preparando el servidor de pruebas…" : !conGps && !punto ? "Marca abajo, en el plano, dónde estás." : senalMala ? "Revisa la intensidad de señal en Más detalles." : null;

  const empezar = async () => {
    if (falta || !servidor) return;
    setError(null);
    setResultado(null);
    try {
      localStorage.setItem(PREFS, JSON.stringify({ lugar: lugar.trim() }));
    } catch {
      /* sin almacenamiento local, no pasa nada */
    }
    // La ubicación se busca mientras corre la prueba: así no se espera dos veces
    let ubicacion: Ubicacion | null = null;
    const buscar = conGps
      ? (setUbic({ estado: "buscando" }),
        obtenerUbicacion()
          .then((u) => {
            ubicacion = u;
            setUbic({ estado: "lista", u });
          })
          .catch((e: ErrorUbicacion) => setUbic({ estado: "error", e })))
      : Promise.resolve();
    try {
      const [r] = await Promise.all([medirRed(servidor, ligera, setProgreso), buscar]);
      const u = ubicacion as Ubicacion | null;
      const m = completar({
        lugar: lugarFinal,
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

  return (
    <div className="medir">
      <section className="tarjeta medir__principal" aria-live="polite">
        {resultado && !midiendo ? (
          <Resultado m={resultado} consumo={consumo} />
        ) : (
          <div className="medir__vivo">
            <Medidor
              valor={valorVivo}
              maximo={progreso?.unidad === "ms" ? 300 : 100}
              etiqueta={progreso ? NOMBRE_FASE[progreso.fase] : "Mide la calidad de tu conexión"}
              unidad={progreso?.unidad}
              color={progreso ? "var(--acento)" : undefined}
            />
            {midiendo && (
              <div className="barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progreso?.avance ?? 0) * 100)}>
                <span style={{ width: `${(progreso?.avance ?? 0) * 100}%` }} />
              </div>
            )}
          </div>
        )}
        {error && <p className="alerta">{error}</p>}

        <button type="button" className="boton boton--grande boton--medir" onClick={empezar} disabled={!!falta || midiendo}>
          {midiendo ? "Midiendo…" : resultado ? "Medir otra vez" : "Medir mi conexión"}
        </button>
        {falta && !midiendo && <p className="ayuda centro">{falta}</p>}

        <ul className="chips" aria-label="Datos de la medición">
          <li>
            <span className="chips__icono" aria-hidden="true">
              {tipo === "wifi" ? "📶" : "📱"}
            </span>
            {tipo === "wifi" ? "Wi-Fi" : `Datos móviles${tecnologia ? ` ${tecnologia}` : ""}`}
            {detectada === tipo && <small>detectado</small>}
          </li>
          <li>
            <span className="chips__icono" aria-hidden="true">
              📍
            </span>
            {!conGps
              ? punto
                ? "Punto marcado en el plano"
                : "Sin GPS: marca el punto"
              : ubic.estado === "buscando"
                ? "Buscando tu ubicación…"
                : ubic.estado === "lista"
                  ? `Ubicación lista (±${ubic.u.precision} m)`
                  : ubic.estado === "error"
                    ? "Sin ubicación"
                    : "Tu ubicación se toma al medir"}
          </li>
          <li>
            <span className="chips__icono" aria-hidden="true">
              🏷️
            </span>
            {lugarFinal}
          </li>
        </ul>
        {ubic.estado === "error" && <p className="ayuda centro">{MENSAJE_UBICACION[ubic.e]} La medición se guarda igual, sin punto en el mapa.</p>}
        {ubic.estado === "lista" && ubic.u.precision > 40 && (
          <p className="ayuda centro">El GPS está impreciso (±{ubic.u.precision} m). En interiores pasa seguido: acércate a una ventana para más precisión.</p>
        )}

        <details className="detalles">
          <summary>Más detalles (opcional)</summary>
          <fieldset className="campo">
            <legend>Conexión</legend>
            <div className="segmentado" role="radiogroup">
              {(["wifi", "movil"] as TipoRed[]).map((t) => (
                <label key={t} className={tipo === t ? "activo" : undefined}>
                  <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} disabled={midiendo} />
                  {t === "wifi" ? "Wi-Fi" : "Datos móviles"}
                </label>
              ))}
            </div>
            {!detectada && <small className="ayuda">Este navegador no dice qué conexión usas: elígela tú.</small>}
          </fieldset>
          {tipo === "movil" && (
            <fieldset className="campo">
              <legend>Tecnología de la red</legend>
              <div className="segmentado segmentado--pequeno" role="radiogroup">
                {(["", "3G", "4G", "5G"] as Tecnologia[]).map((t) => (
                  <label key={t || "nose"} className={tecnologia === t ? "activo" : undefined}>
                    <input type="radio" name="tec" checked={tecnologia === t} onChange={() => setTecnologia(t)} disabled={midiendo} />
                    {t || "No sé"}
                  </label>
                ))}
              </div>
              <small className="ayuda">Míralo en la barra de estado del celular.</small>
            </fieldset>
          )}
          <label className="campo">
            <span>Nombre del lugar</span>
            <input list="lugares" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Casa, Bloque 11, Biblioteca" maxLength={60} disabled={midiendo} />
            <datalist id="lugares">
              {lugares.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <small className="ayuda">Sirve para agrupar y comparar lugares.</small>
          </label>
          <label className="campo">
            <span>Intensidad de señal</span>
            <div className="con-unidad">
              <input inputMode="numeric" value={senal} onChange={(e) => setSenal(e.target.value.replace(/[^\d-]/g, ""))} placeholder="-65" disabled={midiendo} aria-invalid={senalMala} />
              <span>dBm</span>
            </div>
            <small className={senalMala ? "ayuda ayuda--error" : "ayuda"}>
              {senalMala ? "Debe ser un número negativo, entre -130 y -20." : "En Android: Ajustes › Acerca del teléfono › Estado. Más cerca de 0 es mejor."}
            </small>
          </label>
          <label className="interruptor">
            <input type="checkbox" checked={ligera} onChange={(e) => setLigera(e.target.checked)} disabled={midiendo} />
            <span>
              <strong>Prueba ligera</strong>
              <small>{ligera ? "Gasta cerca de 1,5 MB. Ideal con datos móviles." : servidor?.subida ? "La normal gasta cerca de 7 MB." : "La normal gasta cerca de 5 MB."}</small>
            </span>
          </label>
        </details>
      </section>

      {!conGps && (
        <section className="tarjeta medir__plano" aria-labelledby="t-punto">
          <h2 id="t-punto" className="tarjeta__titulo">
            Marca dónde estás
          </h2>
          <p className="ayuda">En esta versión el navegador no deja usar el GPS. Toca la zona del plano donde estás parado.</p>
          <Plano puntos={delLugar} seleccion={punto} onElegir={midiendo ? undefined : setPunto} etiqueta="Plano del lugar para marcar el punto de medición" />
        </section>
      )}
    </div>
  );
}

function Resultado({ m, consumo }: { m: Medicion; consumo: number | null }) {
  const cat = categoria(m.puntaje);
  return (
    <div className="resultado">
      <Medidor valor={m.puntaje} etiqueta={`Calidad ${NOMBRE_CATEGORIA[cat].toLowerCase()}`} />
      <dl className="cifras">
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
        <div>
          <dt>Estabilidad</dt>
          <dd>{m.estabilidad} %</dd>
        </div>
        {m.senal != null && (
          <div>
            <dt>Señal</dt>
            <dd>{dbm(m.senal)}</dd>
          </div>
        )}
      </dl>
      <ul className="explicaciones">
        {explicaciones(m).map((e) => (
          <li key={e.texto} className={`explicacion explicacion--${e.tono}`}>
            {e.texto}
          </li>
        ))}
      </ul>
      {consumo != null && <p className="nota">Esta prueba usó {consumo.toFixed(1)} MB de datos. Quedó guardada en el historial.</p>}
    </div>
  );
}
