// Ubicación del dispositivo con el GPS (Geolocation API).
// Se escucha unos segundos y se queda con la lectura más precisa: la primera suele ser la de la red,
// que puede errar por cientos de metros. En interiores el GPS es menos preciso.

export interface Ubicacion {
  lat: number;
  lng: number;
  precision: number;
}

export type ErrorUbicacion = "no-disponible" | "denegada" | "sin-senal";

export const MENSAJE_UBICACION: Record<ErrorUbicacion, string> = {
  "no-disponible": "Aquí no se puede usar la ubicación del dispositivo.",
  denegada: "No diste permiso de ubicación. Actívalo en el candado de la barra de direcciones.",
  "sin-senal": "No se pudo obtener tu ubicación. Prueba cerca de una ventana o al aire libre.",
};

/** Dentro de una página publicada en Claude el navegador bloquea la ubicación. */
export const ubicacionDisponible = () =>
  "geolocation" in navigator && !(window as unknown as { claude?: unknown }).claude && window.isSecureContext;

export function obtenerUbicacion(maxMs = 8000, suficiente = 20): Promise<Ubicacion> {
  return new Promise((resolver, rechazar) => {
    if (!ubicacionDisponible()) return rechazar("no-disponible" as ErrorUbicacion);
    let mejor: Ubicacion | null = null;
    const terminar = () => {
      navigator.geolocation.clearWatch(id);
      clearTimeout(t);
      if (mejor) resolver(mejor);
      else rechazar("sin-senal" as ErrorUbicacion);
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const u = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) };
        if (!mejor || u.precision < mejor.precision) mejor = u;
        if (u.precision <= suficiente) terminar();
      },
      (e) => {
        navigator.geolocation.clearWatch(id);
        clearTimeout(t);
        if (mejor) return resolver(mejor);
        rechazar((e.code === e.PERMISSION_DENIED ? "denegada" : "sin-senal") as ErrorUbicacion);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    );
    const t = setTimeout(terminar, maxMs);
  });
}
