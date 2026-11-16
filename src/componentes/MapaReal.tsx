import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { encenderBrujula } from "../lib/brujula";
import { encenderSiHayPermiso, gps, MENSAJE_UBICACION, ubicacionDisponible, type ErrorUbicacion, type Ubicacion } from "../lib/ubicacion";
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

/** El margen dentro del cual se puede mover un punto: la precisión del GPS, con un mínimo de 15 m. */
export const margen = (m: Medicion) => Math.max(15, m.precision ?? 15);

export function MapaReal({
  puntos,
  activo,
  onTocarPunto,
  editando,
  onMover,
}: {
  puntos: Medicion[];
  activo?: string | null;
  onTocarPunto: (m: Medicion) => void;
  editando?: string | null;
  onMover?: (m: Medicion, lat: number, lng: number) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capas = useRef<L.LayerGroup | null>(null);
  const tocar = useRef(onTocarPunto);
  tocar.current = onTocarPunto;
  const mover = useRef(onMover);
  mover.current = onMover;
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
      const editable = p.id === editando;
      // Margen de error del GPS de la medición elegida
      if (p.id === activo && p.precision != null) {
        const centro = p.origen ?? { lat: p.lat!, lng: p.lng! };
        L.circle([centro.lat, centro.lng], { radius: margen(p), color: "#ffffff", weight: 1.5, opacity: 0.6, fillColor: "#ffffff", fillOpacity: 0.06, dashArray: "4 6", interactive: false }).addTo(g);
      }
      const icono = L.divIcon({
        className: "",
        html: `<span class="marcador${p.id === activo ? " marcador--activo" : ""}${editable ? " marcador--editable" : ""}" style="background:${colorPuntaje(p.puntaje)}">${p.puntaje}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      const marca = L.marker([p.lat!, p.lng!], { icon: icono, keyboard: true, title: `Puntaje ${p.puntaje}`, draggable: editable, zIndexOffset: editable ? 1000 : 0 })
        .on("click", () => tocar.current(p))
        .addTo(g);
      if (editable) {
        const origen = L.latLng(p.origen?.lat ?? p.lat!, p.origen?.lng ?? p.lng!);
        const radio = margen(p);
        // No se deja salir del margen del GPS: si se pasa, el punto vuelve al borde del círculo
        marca.on("drag", () => {
          const pos = marca.getLatLng();
          const d = m.distance(origen, pos);
          if (d > radio) {
            const f = radio / d;
            marca.setLatLng([origen.lat + (pos.lat - origen.lat) * f, origen.lng + (pos.lng - origen.lng) * f]);
          }
        });
        marca.on("dragend", () => {
          const pos = marca.getLatLng();
          mover.current?.(p, pos.lat, pos.lng);
        });
      }
    }
    // Se encuadra solo cuando cambia el conjunto de puntos, no al elegir uno
    const clave = puntos.map((p) => p.id).join();
    if (clave !== encuadrado.current) {
      encuadrado.current = clave;
      m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat!, p.lng!])), { padding: [30, 30], maxZoom: 20 });
    }
  }, [puntos, activo, editando]);

  /* ---------- "Estás aquí" en tiempo real ---------- */
  const [yo, setYo] = useState<Ubicacion | null>(null);
  const [errorYo, setErrorYo] = useState<ErrorUbicacion | null>(null);
  const [siguiendo, setSiguiendo] = useState(false);
  const [brujula, setBrujula] = useState<number | null>(null);
  const marcaYo = useRef<L.Marker | null>(null);
  const circuloYo = useRef<L.Circle | null>(null);
  const apagarBrujula = useRef<(() => void) | null>(null);
  const seguir = useRef(false);
  seguir.current = siguiendo;

  useEffect(() => {
    if (!ubicacionDisponible()) return;
    // Si el permiso ya estaba dado, el punto aparece solo
    encenderSiHayPermiso();
    return gps.escuchar((u, e) => {
      setYo(u);
      setErrorYo(e);
    });
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    const soltar = () => setSiguiendo(false);
    m.on("dragstart", soltar);
    return () => {
      m.off("dragstart", soltar);
      apagarBrujula.current?.();
    };
  }, []);

  // El punto se mueve sin redibujar el resto del mapa
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (!yo) {
      marcaYo.current?.remove();
      circuloYo.current?.remove();
      marcaYo.current = null;
      circuloYo.current = null;
      return;
    }
    const pos = L.latLng(yo.lat, yo.lng);
    if (!marcaYo.current) {
      const icono = L.divIcon({ className: "", html: '<div class="yo"><div class="yo__cono"></div><div class="yo__punto"></div></div>', iconSize: [96, 96], iconAnchor: [48, 48] });
      circuloYo.current = L.circle(pos, { radius: yo.precision, color: "#ffffff", weight: 0, fillColor: "#ffffff", fillOpacity: 0.08, interactive: false }).addTo(m);
      marcaYo.current = L.marker(pos, { icon: icono, interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(m);
    } else {
      marcaYo.current.setLatLng(pos);
      circuloYo.current?.setLatLng(pos).setRadius(yo.precision);
    }
    if (seguir.current) m.panTo(pos, { animate: true });
  }, [yo]);

  // La flecha: la brújula si la hay; si no, el rumbo al caminar que da el GPS
  const rumbo = brujula ?? yo?.rumbo ?? null;
  useEffect(() => {
    const el = marcaYo.current?.getElement()?.querySelector<HTMLElement>(".yo__cono");
    if (!el) return;
    el.style.opacity = rumbo == null ? "0" : "1";
    if (rumbo != null) el.style.transform = `rotate(${rumbo}deg)`;
  }, [rumbo, yo]);

  const activarSeguimiento = async () => {
    gps.iniciar();
    gps.pedirNueva();
    setSiguiendo(true);
    const m = mapa.current;
    const u = gps.actual();
    if (m && u) m.setView([u.lat, u.lng], Math.max(m.getZoom(), 19));
    // La brújula se pide en el mismo toque (iPhone lo exige)
    if (!apagarBrujula.current) apagarBrujula.current = await encenderBrujula(setBrujula);
  };

  // Al llegar la primera posición tras tocar el botón, se centra ahí
  const centrado = useRef(false);
  useEffect(() => {
    const m = mapa.current;
    if (siguiendo && yo && m && !centrado.current) {
      centrado.current = true;
      m.setView([yo.lat, yo.lng], Math.max(m.getZoom(), 19));
    }
    if (!siguiendo) centrado.current = false;
  }, [siguiendo, yo]);

  return (
    <div className="mapa-real-caja">
      <div className="mapa-real" ref={caja} role="region" aria-label="Mapa de cobertura sobre el plano de la zona" />
      {ubicacionDisponible() && (
        <button type="button" className={`mi-ubicacion${siguiendo ? " mi-ubicacion--activa" : ""}`} onClick={activarSeguimiento} aria-pressed={siguiendo} aria-label="Mostrar dónde estoy y seguirme">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            <circle cx="12" cy="12" r="5.5" />
            <circle cx="12" cy="12" r="1.8" className="mi-ubicacion__centro" />
          </svg>
          {siguiendo ? "Siguiéndote" : "Mi ubicación"}
        </button>
      )}
      {siguiendo && errorYo === "denegada" && <p className="mapa-aviso">{MENSAJE_UBICACION.denegada} Los pasos están en Medir.</p>}
      {siguiendo && !yo && errorYo !== "denegada" && <p className="mapa-aviso">Buscando tu ubicación…</p>}
    </div>
  );
}
