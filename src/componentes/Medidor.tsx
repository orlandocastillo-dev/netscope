import { colorPuntaje } from "../lib/formato";

const SEGMENTOS = 48;
const INICIO = 135; // grados: el dial abre hacia abajo, como un instrumento
const BARRIDO = 270;

/**
 * Dial de segmentos. Los segmentos se encienden hasta el valor; en reposo quedan en el tono de superficie.
 * Durante la prueba muestra el valor en vivo; al final, el puntaje de 0 a 100 con el color de su categoría.
 */
export function Medidor({ valor, maximo = 100, etiqueta, unidad, tono }: { valor: number | null; maximo?: number; etiqueta: string; unidad?: string; tono?: string }) {
  const t = valor == null ? 0 : Math.min(1, Math.max(0, valor / maximo));
  const encendidos = Math.round(t * SEGMENTOS);
  const color = tono ?? (valor == null ? "var(--raised)" : colorPuntaje((valor / maximo) * 100));
  const texto = valor == null ? "—" : valor < 10 && unidad ? valor.toFixed(1) : String(Math.round(valor));
  return (
    <div className="dial" role="img" aria-label={valor == null ? etiqueta : `${etiqueta}: ${texto} ${unidad ?? ""}`}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        {Array.from({ length: SEGMENTOS }, (_, i) => {
          const a = ((INICIO + (i / (SEGMENTOS - 1)) * BARRIDO) * Math.PI) / 180;
          const r1 = 104;
          const r2 = i % 6 === 0 ? 84 : 90;
          return (
            <line
              key={i}
              x1={120 + Math.cos(a) * r1}
              y1={120 + Math.sin(a) * r1}
              x2={120 + Math.cos(a) * r2}
              y2={120 + Math.sin(a) * r2}
              className="dial__segmento"
              style={{ stroke: i < encendidos ? color : undefined }}
            />
          );
        })}
      </svg>
      <div className="dial__centro">
        <span className="dial__valor">{texto}</span>
        {unidad && <span className="dial__unidad">{unidad}</span>}
      </div>
      <p className="dial__etiqueta">{etiqueta}</p>
    </div>
  );
}

/**
 * La traza de la prueba en vivo: los 15 pings como barras (más alta = más lenta) y la velocidad de
 * descarga como una línea. Son los valores reales de esta medición, no una animación.
 */
export function Traza({ pings, descarga: muestras }: { pings: number[]; descarga: number[] }) {
  const W = 300;
  const H = 70;
  const maxPing = Math.max(50, ...pings);
  const anchoBarra = 8;
  const hueco = 4;
  const descarga = muestras.length === 1 ? [muestras[0], muestras[0]] : muestras;
  const maxMbps = Math.max(10, ...descarga);
  const xs = descarga.map((_, i) => 196 + (i / Math.max(1, descarga.length - 1)) * (W - 200));
  const linea = descarga.map((v, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${(H - 6 - (v / maxMbps) * (H - 16)).toFixed(1)}`).join(" ");
  return (
    <figure className="traza">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {Array.from({ length: 15 }, (_, i) => {
          const v = pings[i];
          const h = v == null ? 3 : Math.max(3, (v / maxPing) * (H - 16));
          return <rect key={i} x={i * (anchoBarra + hueco)} y={H - 6 - h} width={anchoBarra} height={h} rx="2" className={v == null ? "traza__vacia" : "traza__ping"} />;
        })}
        {descarga.length > 1 ? <path d={linea} className="traza__linea" /> : <rect x="196" y={H - 9} width={W - 196} height="3" rx="1.5" className="traza__vacia" />}
      </svg>
      <figcaption>
        <span>Pings ({pings.length}/15)</span>
        <span>Descarga</span>
      </figcaption>
    </figure>
  );
}
