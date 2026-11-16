import { colorPuntaje } from "../lib/formato";

/** Medidor semicircular. Durante la prueba muestra el valor en vivo; al final, el puntaje de 0 a 100. */
export function Medidor({ valor, maximo = 100, etiqueta, unidad, color }: { valor: number | null; maximo?: number; etiqueta: string; unidad?: string; color?: string }) {
  const t = valor == null ? 0 : Math.min(1, Math.max(0, valor / maximo));
  // Arco de 240°, de -210° a 30°
  const r = 88;
  const cx = 110;
  const cy = 110;
  const punto = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const arco = (desde: number, hasta: number) => {
    const [x1, y1] = punto(desde);
    const [x2, y2] = punto(hasta);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${hasta - desde > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const inicio = 150;
  const fin = 390;
  const tono = color ?? (valor == null ? "var(--linea)" : colorPuntaje((valor / maximo) * 100));
  return (
    <svg className="medidor" viewBox="0 0 220 190" role="img" aria-label={valor == null ? etiqueta : `${etiqueta}: ${Math.round(valor)} ${unidad ?? ""}`}>
      <path d={arco(inicio, fin)} className="medidor__pista" />
      {t > 0.002 && <path d={arco(inicio, inicio + (fin - inicio) * t)} className="medidor__barra" style={{ stroke: tono }} />}
      <text x="110" y="112" className="medidor__valor">
        {valor == null ? "—" : valor < 10 && unidad ? valor.toFixed(1) : Math.round(valor)}
      </text>
      <text x="110" y="138" className="medidor__unidad">
        {unidad ?? ""}
      </text>
      <text x="110" y="180" className="medidor__etiqueta">
        {etiqueta}
      </text>
    </svg>
  );
}
