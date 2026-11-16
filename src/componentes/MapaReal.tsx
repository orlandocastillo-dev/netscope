import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { colorPuntaje } from "../lib/formato";
import type { Medicion } from "../lib/tipos";

/** Hasta qué distancia (en metros) se pinta el color alrededor de un punto medido. */
const ALCANCE_LLENO = 8;
const ALCANCE_MAX = 22;

/**
 * Capa de calor sobre el mapa: interpolación por distancia inversa (IDW) en metros reales.
 * Se redibuja al mover o hacer zoom; lejos de cualquier medición se desvanece.
 */
class CapaCalor extends L.Layer {
  private lienzo?: HTMLCanvasElement;
  constructor(private puntos: Medicion[]) {
    super();
  }
  onAdd(map: L.Map) {
    this.lienzo = L.DomUtil.create("canvas", "capa-calor") as HTMLCanvasElement;
    map.getPanes().overlayPane.appendChild(this.lienzo);
    map.on("moveend zoomend resize", this.dibujar, this);
    map.on("zoomstart", this.ocultar, this);
    this.dibujar();
    return this;
  }
  onRemove(map: L.Map) {
    map.off("moveend zoomend resize", this.dibujar, this);
    map.off("zoomstart", this.ocultar, this);
    this.lienzo?.remove();
    return this;
  }
  private ocultar() {
    if (this.lienzo) this.lienzo.style.visibility = "hidden";
  }
  private dibujar() {
    const map = this._map;
    const c = this.lienzo;
    if (!map || !c) return;
    const tam = map.getSize();
    const paso = 4;
    const w = Math.ceil(tam.x / paso);
    const h = Math.ceil(tam.y / paso);
    c.width = w;
    c.height = h;
    c.style.width = `${tam.x}px`;
    c.style.height = `${tam.y}px`;
    c.style.visibility = "visible";
    L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
    // Metros por píxel en el centro del mapa (alcanza para un campus o una casa)
    const centro = map.getCenter();
    const mpp = (40075016.686 * Math.cos((centro.lat * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
    const pts = this.puntos.map((p) => {
      const q = map.latLngToContainerPoint([p.lat!, p.lng!]);
      return { x: q.x, y: q.y, v: p.puntaje };
    });
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = i * paso + paso / 2;
        const y = j * paso + paso / 2;
        let suma = 0;
        let pesos = 0;
        let cerca = Infinity;
        for (const p of pts) {
          const d2 = ((x - p.x) * mpp) ** 2 + ((y - p.y) * mpp) ** 2;
          if (d2 < cerca) cerca = d2;
          const peso = 1 / Math.max(d2, 0.25);
          suma += peso * p.v;
          pesos += peso;
        }
        const d = Math.sqrt(cerca);
        if (d > ALCANCE_MAX) continue;
        const alfa = d < ALCANCE_LLENO ? 1 : 1 - (d - ALCANCE_LLENO) / (ALCANCE_MAX - ALCANCE_LLENO);
        const col = colorPuntaje(suma / pesos)
          .match(/\d+/g)!
          .map(Number);
        const k = (j * w + i) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = Math.round(150 * alfa);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}

export function MapaReal({ puntos, activo, onTocarPunto }: { puntos: Medicion[]; activo?: string | null; onTocarPunto: (m: Medicion) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capas = useRef<L.LayerGroup | null>(null);
  const tocar = useRef(onTocarPunto);
  tocar.current = onTocarPunto;
  const encuadrado = useRef("");

  useEffect(() => {
    if (!caja.current) return;
    const m = L.map(caja.current, { zoomControl: true, attributionControl: true }).setView([10.9939, -74.7926], 17);
    // Calles de OpenStreetMap: gratis y sin clave. Se oscurecen con CSS para que combinen con la app.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxNativeZoom: 19,
      maxZoom: 20,
      className: "teselas-oscuras",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    capas.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    const g = capas.current;
    if (!m || !g) return;
    g.clearLayers();
    if (!puntos.length) return;
    g.addLayer(new CapaCalor(puntos));
    for (const p of puntos) {
      const icono = L.divIcon({
        className: "",
        html: `<span class="marcador${p.id === activo ? " marcador--activo" : ""}" style="background:${colorPuntaje(p.puntaje)}">${p.puntaje}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([p.lat!, p.lng!], { icon: icono, keyboard: true, title: `Puntaje ${p.puntaje}` })
        .on("click", () => tocar.current(p))
        .addTo(g);
    }
    // Se encuadra solo cuando cambia el conjunto de puntos, no al elegir uno
    const clave = puntos.map((p) => p.id).join();
    if (clave !== encuadrado.current) {
      encuadrado.current = clave;
      m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat!, p.lng!])), { padding: [30, 30], maxZoom: 20 });
    }
  }, [puntos, activo]);

  return <div className="mapa-real" ref={caja} role="region" aria-label="Mapa de cobertura sobre el plano de la zona" />;
}
