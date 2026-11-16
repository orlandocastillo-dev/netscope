// Datos de ejemplo para mostrar el sistema sin salir a medir.
// Simulan una casa con el router en la sala, un muro que debilita el Wi-Fi hacia los cuartos
// y una ventana por donde entra la señal 5G. Quedan marcados como ejemplo y se pueden borrar.

import { completar } from "./almacen";
import type { Medicion, Tecnologia } from "./tipos";

/** Generador con semilla, para que los ejemplos salgan iguales cada vez. */
function azar(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const redondear = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

/** Pasa un punto del plano (0..1) a coordenadas, en un rectángulo de `ancho` x `alto` metros. */
function geo(origen: { lat: number; lng: number }, ancho: number, alto: number, x: number, y: number) {
  const mLat = 111320;
  const mLng = 111320 * Math.cos((origen.lat * Math.PI) / 180);
  return {
    lat: redondear(origen.lat - (y * alto) / mLat, 6),
    lng: redondear(origen.lng + (x * ancho) / mLng, 6),
    precision: 8,
    x: redondear(x, 3),
    y: redondear(y, 3),
  };
}
// Esquinas superiores izquierdas de los dos lugares de ejemplo, cerca de la CUC en Barranquilla
const CASA = { lat: 10.99702, lng: -74.79132 };
const BIBLIOTECA = { lat: 10.99415, lng: -74.79262 };

export function datosDeEjemplo(): Medicion[] {
  const r = azar(42);
  const salida: Medicion[] = [];
  const ahora = Date.now();
  let n = 0;
  const fecha = () => new Date(ahora - (36 - n++) * 47 * 60 * 1000 - r() * 600000);

  // --- Casa: router en (0.18, 0.3); muro vertical en x = 0.55 ---
  const router = { x: 0.18, y: 0.3 };
  const ventana5g = { x: 0.88, y: 0.15 };
  for (let fila = 0; fila < 5; fila++) {
    for (let col = 0; col < 6; col++) {
      const x = 0.08 + col * 0.168 + (r() - 0.5) * 0.03;
      const y = 0.12 + fila * 0.19 + (r() - 0.5) * 0.03;
      const d = Math.hypot(x - router.x, y - router.y);
      const muro = x > 0.55 ? 1 : 0;
      // Wi-Fi: excelente cerca del router, cae con la distancia y mucho más detrás del muro
      const calidadWifi = Math.max(0.03, 1 - d * 0.9 - muro * 0.45);
      {
        salida.push(
          completar(
            {
              lugar: "Casa (ejemplo)",
              tipo: "wifi",
              tecnologia: "",
              ...geo(CASA, 40, 30, x, y),
              latencia: redondear(6 + (1 - calidadWifi) * 140 + r() * 8),
              jitter: redondear(1 + (1 - calidadWifi) * 30 + r() * 3),
              perdida: redondear(calidadWifi < 0.25 ? 2 + r() * 4 : calidadWifi < 0.45 ? r() * 1.5 : 0),
              descarga: redondear(Math.max(0.8, 95 * calidadWifi ** 1.6 + r() * 4)),
              subida: redondear(Math.max(0.4, 40 * calidadWifi ** 1.6 + r() * 2)),
              senal: Math.round(-38 - (1 - calidadWifi) * 52 - r() * 3),
              ligera: false,
              ejemplo: true,
              servidor: "simulado",
            },
            fecha(),
          ),
        );
      }
      // Datos móviles en la mitad de los puntos: 4G parejo, 5G solo cerca de la ventana
      if ((fila * 6 + col) % 2 === 0) {
        const d5 = Math.hypot(x - ventana5g.x, y - ventana5g.y);
        const es5g = d5 < 0.55;
        const tec: Tecnologia = es5g ? "5G" : "4G";
        const calidadMovil = es5g ? Math.max(0.45, 0.95 - d5 * 1.1) : 0.38 + r() * 0.12 - muro * 0.04;
        salida.push(
          completar(
            {
              lugar: "Casa (ejemplo)",
              tipo: "movil",
              tecnologia: tec,
              ...geo(CASA, 40, 30, x, y),
              latencia: redondear(es5g ? 16 + r() * 8 : 38 + r() * 25),
              jitter: redondear(es5g ? 3 + r() * 3 : 8 + r() * 9),
              perdida: redondear(r() < 0.15 ? r() * 1.2 : 0),
              descarga: redondear(Math.max(1, (es5g ? 160 : 28) * calidadMovil + r() * 5)),
              subida: redondear(Math.max(0.5, (es5g ? 45 : 9) * calidadMovil + r() * 2)),
              senal: Math.round(es5g ? -72 - d5 * 30 : -88 - r() * 10),
              ligera: true,
              ejemplo: true,
              servidor: "simulado",
            },
            fecha(),
          ),
        );
      }
    }
  }

  // --- Biblioteca: Wi-Fi saturado por muchos usuarios, 4G aceptable ---
  for (let i = 0; i < 6; i++) {
    const x = 0.15 + (i % 3) * 0.33;
    const y = i < 3 ? 0.3 : 0.7;
    salida.push(
      completar(
        {
          lugar: "Biblioteca (ejemplo)",
          tipo: "wifi",
          tecnologia: "",
          ...geo(BIBLIOTECA, 50, 37, x, y),
          latencia: redondear(70 + r() * 90),
          jitter: redondear(18 + r() * 25),
          perdida: redondear(0.5 + r() * 3),
          descarga: redondear(3 + r() * 6),
          subida: redondear(1 + r() * 2.5),
          senal: Math.round(-58 - r() * 10),
          ligera: false,
          ejemplo: true,
          servidor: "simulado",
        },
        fecha(),
      ),
      completar(
        {
          lugar: "Biblioteca (ejemplo)",
          tipo: "movil",
          tecnologia: "4G",
          ...geo(BIBLIOTECA, 50, 37, x + 0.04, y + 0.04),
          latencia: redondear(35 + r() * 20),
          jitter: redondear(6 + r() * 6),
          perdida: 0,
          descarga: redondear(14 + r() * 12),
          subida: redondear(4 + r() * 5),
          senal: Math.round(-84 - r() * 8),
          ligera: true,
          ejemplo: true,
          servidor: "simulado",
        },
        fecha(),
      ),
    );
  }
  return salida;
}
