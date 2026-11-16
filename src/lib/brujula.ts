// Brújula del celular, para que el punto "estás aquí" apunte hacia donde mira la persona.
// iPhone pide permiso aparte (DeviceOrientationEvent.requestPermission) y solo deja pedirlo
// desde un toque; Android entrega la orientación absoluta sin preguntar.

type EventoOrientacion = DeviceOrientationEvent & { webkitCompassHeading?: number };
type ConPermiso = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/** Llamar desde un toque. Devuelve la función para apagarla, o null si no hay brújula o no dieron permiso. */
export async function encenderBrujula(alGirar: (grados: number) => void): Promise<(() => void) | null> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return null;
  const D = DeviceOrientationEvent as ConPermiso;
  // iPhone no manda la orientación sin este permiso. En Android y en Chrome el pedido existe
  // pero los datos llegan igual, así que se escucha de todas formas.
  if (typeof D.requestPermission === "function") {
    try {
      await D.requestPermission();
    } catch {
      /* sin permiso: si el navegador no manda datos, la flecha usa el rumbo del GPS */
    }
  }
  let pendiente: number | null = null;
  let cuadro = 0;
  const enviar = () => {
    cuadro = 0;
    if (pendiente != null) alGirar(pendiente);
  };
  const leer = (e: Event) => {
    const o = e as EventoOrientacion;
    let grados: number | null = null;
    if (typeof o.webkitCompassHeading === "number") grados = o.webkitCompassHeading; // iPhone: ya viene respecto al norte
    else if (o.absolute && o.alpha != null) grados = (360 - o.alpha) % 360; // Android
    if (grados == null) return;
    // Se corrige por la orientación de la pantalla (celular acostado)
    const giroPantalla = screen.orientation?.angle ?? 0;
    pendiente = (grados + giroPantalla + 360) % 360;
    if (!cuadro) cuadro = requestAnimationFrame(enviar);
  };
  const evento = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  window.addEventListener(evento, leer);
  return () => {
    window.removeEventListener(evento, leer);
    if (cuadro) cancelAnimationFrame(cuadro);
  };
}
