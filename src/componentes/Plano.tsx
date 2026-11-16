import { useEffect, useRef, useState } from "react";
import { colorPuntaje } from "../lib/formato";
import type { Medicion } from "../lib/tipos";

const COLUMNAS = 12;
const FILAS = 9;
/** Relación del plano: 4:3. */
export const PROPORCION = 3 / 4;

interface Props {
  puntos: Medicion[];
  /** Dibuja el mapa de calor interpolado entre los puntos. */
  calor?: boolean;
  seleccion?: { x: number; y: number } | null;
  onElegir?: (p: { x: number; y: number }) => void;
  onTocarPunto?: (m: Medicion) => void;
  activo?: string | null;
  etiqueta: string;
}

/**
 * Interpolación por distancia inversa (IDW): cada píxel toma el promedio de los puntajes
 * pesado por 1/d². Lejos de cualquier medición se desvanece, para no aparentar un dato que no existe.
 */
function pintarCalor(ctx: CanvasRenderingContext2D, w: number, h: number, puntos: Medicion[]) {
  const ancho = 96;
  const alto = Math.round(ancho * PROPORCION);
  const img = ctx.createImageData(ancho, alto);
  for (let j = 0; j < alto; j++) {
    for (let i = 0; i < ancho; i++) {
      const x = (i + 0.5) / ancho;
      const y = (j + 0.5) / alto;
      let suma = 0;
      let pesos = 0;
      let cerca = Infinity;
      for (const p of puntos) {
        // Las distancias se miden en el plano real (4:3), no en el cuadrado 0..1
        const d2 = (x - p.x!) ** 2 + ((y - p.y!) * PROPORCION) ** 2;
        cerca = Math.min(cerca, d2);
        const w = 1 / Math.max(d2, 1e-5);
        suma += w * p.puntaje;
        pesos += w;
      }
      const d = Math.sqrt(cerca);
      const desvanecer = d < 0.1 ? 1 : d > 0.3 ? 0 : 1 - (d - 0.1) / 0.2;
      const c = colorPuntaje(suma / pesos)
        .match(/\d+/g)!
        .map(Number);
      const k = (j * ancho + i) * 4;
      img.data[k] = c[0];
      img.data[k + 1] = c[1];
      img.data[k + 2] = c[2];
      img.data[k + 3] = Math.round(200 * desvanecer);
    }
  }
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(lienzo, 0, 0, w, h);
}

export function Plano({ puntos, calor = false, seleccion, onElegir, onTocarPunto, activo, etiqueta }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(600);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = ancho;
    const h = Math.round(w * PROPORCION);
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const estilo = getComputedStyle(c);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = estilo.getPropertyValue("--plano-fondo") || "#f6f7f9";
    ctx.fillRect(0, 0, w, h);
    if (calor && puntos.length) pintarCalor(ctx, w, h, puntos);
    // Cuadrícula
    ctx.strokeStyle = estilo.getPropertyValue("--plano-linea") || "rgba(0,0,0,.08)";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLUMNAS; i++) {
      const x = Math.round((i / COLUMNAS) * w) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let j = 1; j < FILAS; j++) {
      const y = Math.round((j / FILAS) * h) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Puntos medidos
    const r = Math.max(9, Math.min(15, w / 42));
    ctx.font = `700 ${Math.round(r * 0.95)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of puntos) {
      const x = p.x! * w;
      const y = p.y! * h;
      ctx.beginPath();
      ctx.arc(x, y, p.id === activo ? r * 1.25 : r, 0, Math.PI * 2);
      ctx.fillStyle = colorPuntaje(p.puntaje);
      ctx.fill();
      ctx.lineWidth = p.id === activo ? 3 : 2;
      ctx.strokeStyle = "#0c0d0f";
      ctx.stroke();
      if (calor) {
        ctx.fillStyle = "#0c0d0f";
        ctx.fillText(String(p.puntaje), x, y + 0.5);
      }
    }
    // Punto elegido para la próxima medición
    if (seleccion) {
      const x = seleccion.x * w;
      const y = seleccion.y * h;
      ctx.strokeStyle = estilo.getPropertyValue("--text") || "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }
  }, [ancho, puntos, calor, seleccion, activo]);

  const tocar = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width;
    const y = (e.clientY - b.top) / b.height;
    if (onTocarPunto) {
      const r = Math.max(9, Math.min(15, b.width / 42)) * 1.6;
      const cerca = puntos.find((p) => Math.hypot((p.x! - x) * b.width, (p.y! - y) * b.height) < r);
      if (cerca) return onTocarPunto(cerca);
    }
    if (onElegir) {
      // Se ajusta al centro de la celda de la cuadrícula
      const cx = (Math.min(COLUMNAS - 1, Math.floor(x * COLUMNAS)) + 0.5) / COLUMNAS;
      const cy = (Math.min(FILAS - 1, Math.floor(y * FILAS)) + 0.5) / FILAS;
      onElegir({ x: cx, y: cy });
    }
  };

  return (
    <div className="plano" ref={caja}>
      <canvas ref={lienzo} onClick={tocar} role="img" aria-label={etiqueta} className={onElegir || onTocarPunto ? "plano--tocable" : undefined} />
    </div>
  );
}
