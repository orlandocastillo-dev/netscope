import { useEffect, useMemo, useState } from "react";
import { Medidor } from "../componentes/Medidor";
import { Plano } from "../componentes/Plano";
import { completar, type Mediciones } from "../lib/almacen";
import { dbm, mbps, ms, pct } from "../lib/formato";
import { infoNavegador, medirRed, type Fase, type Progreso } from "../lib/medicion";
import { categoria, explicaciones, NOMBRE_CATEGORIA } from "../lib/puntaje";
import type { ServidorPruebas } from "../lib/servidor";
import type { Medicion, Tecnologia, TipoRed } from "../lib/tipos";

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
    return JSON.parse(localStorage.getItem(PREFS) ?? "{}") as { lugar?: string; ligera?: boolean };
  } catch {
    return {};
  }
}

export function Medir({ datos, servidor }: { datos: Mediciones; servidor: ServidorPruebas | null }) {
  const prefs = useMemo(leerPrefs, []);
  const red = useMemo(infoNavegador, []);
  const [lugar, setLugar] = useState(prefs.lugar ?? "");
  const [tipo, setTipo] = useState<TipoRed>(red?.tipo === "cellular" ? "movil" : "wifi");
  const [tecnologia, setTecnologia] = useState<Tecnologia>("");
  const [senal, setSenal] = useState("");
  const [ligera, setLigera] = useState(prefs.ligera ?? false);
  const [punto, setPunto] = useState<{ x: number; y: number } | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<Medicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consumo, setConsumo] = useState<number | null>(null);

  // Al cambiar a datos móviles se sugiere la prueba ligera, para no gastar tanto plan
  useEffect(() => {
    if (tipo === "movil" && prefs.ligera === undefined) setLigera(true);
  }, [tipo, prefs.ligera]);

  const lugares = useMemo(() => [...new Set(datos.lista.map((m) => m.lugar))].sort(), [datos.lista]);
  const delLugar = useMemo(() => datos.lista.filter((m) => m.lugar === lugar.trim()), [datos.lista, lugar]);
  const midiendo = progreso != null && progreso.fase !== "listo";
  const senalNum = senal.trim() === "" ? null : Number(senal);
  const senalMala = senalNum != null && (!Number.isFinite(senalNum) || senalNum > -20 || senalNum < -130);
  const listo = lugar.trim() !== "" && punto != null && servidor != null && !senalMala;

  const empezar = async () => {
    if (!listo || !servidor) return;
    setError(null);
    setResultado(null);
    try {
      localStorage.setItem(PREFS, JSON.stringify({ lugar: lugar.trim(), ligera }));
    } catch {
      /* sin almacenamiento local, no pasa nada */
    }
    try {
      const r = await medirRed(servidor, ligera, setProgreso);
      const m = completar({
        lugar: lugar.trim(),
        tipo,
        tecnologia: tipo === "movil" ? tecnologia : "",
        x: punto.x,
        y: punto.y,
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
      <section className="tarjeta medir__formulario" aria-labelledby="t-donde">
        <h2 id="t-donde" className="tarjeta__titulo">
          <span className="paso">1</span> ¿Dónde estás?
        </h2>
        <label className="campo">
          <span>Lugar</span>
          <input list="lugares" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Casa, Bloque 11, Biblioteca" maxLength={60} disabled={midiendo} />
          <datalist id="lugares">
            {lugares.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>

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
            <small className="ayuda">Míralo en la barra de estado del celular. El navegador no lo puede leer.</small>
          </fieldset>
        )}

        <label className="campo">
          <span>
            Intensidad de señal <em>(opcional)</em>
          </span>
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

        {red && (
          <p className="nota">
            El navegador estima: {red.efectivo ? `red tipo ${red.efectivo}` : "tipo de red desconocido"}
            {red.downlink ? `, ~${red.downlink} Mbps` : ""}
            {red.rtt ? `, ~${red.rtt} ms` : ""}. Son valores redondeados, no una medición.
          </p>
        )}
      </section>

      <section className="tarjeta medir__plano" aria-labelledby="t-punto">
        <h2 id="t-punto" className="tarjeta__titulo">
          <span className="paso">2</span> Toca el punto del plano donde estás parado
        </h2>
        <Plano puntos={delLugar} seleccion={punto} onElegir={midiendo ? undefined : setPunto} etiqueta="Plano del lugar para elegir el punto de medición" />
        <p className="ayuda">
          {delLugar.length ? `Ya hay ${delLugar.length} medición${delLugar.length === 1 ? "" : "es"} en este lugar (puntos de color).` : "Imagina el plano del espacio: cada celda es una zona. Mide en varios puntos para armar el mapa."}
        </p>
      </section>

      <section className="tarjeta medir__prueba" aria-labelledby="t-prueba" aria-live="polite">
        <h2 id="t-prueba" className="tarjeta__titulo">
          <span className="paso">3</span> Prueba
        </h2>
        {resultado && !midiendo ? (
          <Resultado m={resultado} consumo={consumo} />
        ) : (
          <div className="medir__vivo">
            <Medidor
              valor={valorVivo}
              maximo={progreso?.unidad === "ms" ? 300 : 100}
              etiqueta={progreso ? NOMBRE_FASE[progreso.fase] : "Listo para medir"}
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
        <button type="button" className="boton boton--grande" onClick={empezar} disabled={!listo || midiendo}>
          {midiendo ? "Midiendo…" : resultado ? "Medir otra vez" : "Iniciar prueba"}
        </button>
        {!listo && !midiendo && (
          <p className="ayuda centro">{!servidor ? "Buscando el servidor de pruebas…" : !lugar.trim() ? "Escribe el lugar para empezar." : !punto ? "Elige tu punto en el plano." : ""}</p>
        )}
        {servidor && (
          <p className="nota centro">
            Se mide contra: {servidor.nombre}.{!servidor.subida && " En esta versión publicada la subida no se puede medir."}
          </p>
        )}
      </section>
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
