import { useEffect, useMemo, useState } from "react";
import { Medidor, Traza } from "../componentes/Medidor";
import { Plano } from "../componentes/Plano";
import { completar, type Mediciones } from "../lib/almacen";
import { colorCategoria, dbm, mbps, ms, pct } from "../lib/formato";
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
  const [pings, setPings] = useState<number[]>([]);
  const [curva, setCurva] = useState<number[]>([]);
  const [resultado, setResultado] = useState<Medicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consumo, setConsumo] = useState<number | null>(null);
  const [ajustes, setAjustes] = useState(false);

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
  const falta = !servidor ? "Preparando el servidor de pruebas…" : !conGps && !punto ? "Marca abajo, en el plano, dónde estás." : senalMala ? "Revisa la intensidad de señal en los ajustes." : null;

  const avisar = (p: Progreso) => {
    setProgreso(p);
    if (p.fase === "latencia" && p.valor != null) setPings((x) => [...x, p.valor!]);
    if (p.fase === "descarga" && p.valor != null) setCurva((x) => [...x, p.valor!]);
  };

  const empezar = async () => {
    if (falta || !servidor) return;
    setError(null);
    setResultado(null);
    setPings([]);
    setCurva([]);
    setAjustes(false);
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
      const [r] = await Promise.all([medirRed(servidor, ligera, avisar), buscar]);
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
  const hallazgos = resultado ? explicaciones(resultado) : [];
  const nombreConexion = tipo === "wifi" ? "Wi-Fi" : `Datos móviles${tecnologia ? ` ${tecnologia}` : ""}`;
  const textoUbicacion = !conGps
    ? punto
      ? "Marcada en el plano"
      : "Márcala en el plano"
    : ubic.estado === "buscando"
      ? "Buscando…"
      : ubic.estado === "lista"
        ? `Lista, ±${ubic.u.precision} m`
        : ubic.estado === "error"
          ? "No disponible"
          : "Se toma al medir";

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
            etiqueta={progreso ? NOMBRE_FASE[progreso.fase] : "¿Qué tan buena es la conexión aquí?"}
            unidad={progreso?.unidad}
            tono={progreso ? "var(--text)" : undefined}
          />
        )}
        {(midiendo || resultado) && <Traza pings={pings} descarga={curva} />}
        {error && <p className="alerta">{error}</p>}
        <button type="button" className="pildora pildora--grande" onClick={empezar} disabled={!!falta || midiendo}>
          {midiendo ? "Midiendo…" : resultado ? "Medir otra vez" : "Medir mi conexión"}
        </button>
        {falta && !midiendo && <p className="ayuda centro">{falta}</p>}
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
        {ubic.estado === "error" && <p className="nota">{MENSAJE_UBICACION[ubic.e]} La medición se guarda igual, sin punto en el mapa.</p>}
        {ubic.estado === "lista" && ubic.u.precision > 40 && <p className="nota">El GPS está impreciso (±{ubic.u.precision} m). En interiores pasa seguido: acércate a una ventana.</p>}

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
