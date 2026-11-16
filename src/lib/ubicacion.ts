// Ubicación del dispositivo con el GPS (Geolocation API).
// El GPS de un celular puede tardar 10 a 30 segundos en dar la primera posición, sobre todo en interiores,
// así que se empieza a escuchar apenas la persona toca "Medir" y se sigue escuchando mientras corre la prueba.

export interface Ubicacion {
  lat: number;
  lng: number;
  precision: number;
  /** Momento de la lectura (ms). */
  hora: number;
}

export type ErrorUbicacion = "no-disponible" | "denegada" | "sin-senal";

/** Pasos para dar el permiso, según el celular y el navegador que se usa. */
export function pasosPermiso(): string[] {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const chromeIos = /CriOS/.test(ua);
  const android = /Android/.test(ua);
  if (ios && chromeIos)
    return [
      "Abre Ajustes del iPhone › Privacidad y seguridad › Localización, y revisa que esté activada.",
      "En esa misma lista entra a Chrome y elige «Al usar la app». Activa «Ubicación exacta».",
      "Vuelve aquí, recarga la página y toca «Intentar de nuevo».",
    ];
  if (ios)
    return [
      "Abre Ajustes del iPhone › Privacidad y seguridad › Localización, y revisa que esté activada.",
      "En esa lista entra a «Sitios web de Safari» y elige «Al usar la app». Activa «Ubicación exacta».",
      "En Safari, toca «aA» en la barra de dirección › Configuración del sitio web › Ubicación › Permitir.",
      "Recarga la página y toca «Intentar de nuevo».",
    ];
  if (android)
    return [
      "Revisa que la ubicación del celular esté activada (desliza el panel de arriba y toca Ubicación).",
      "En Chrome, toca el ícono a la izquierda de la dirección › Permisos › Ubicación › Permitir.",
      "Si no aparece: Ajustes del celular › Aplicaciones › Chrome › Permisos › Ubicación › Permitir solo mientras se usa.",
      "Recarga la página y toca «Intentar de nuevo».",
    ];
  return [
    "Activa la ubicación del dispositivo.",
    "Haz clic en el candado junto a la dirección › Permisos del sitio › Ubicación › Permitir.",
    "Recarga la página y toca «Intentar de nuevo».",
  ];
}

export const MENSAJE_UBICACION: Record<ErrorUbicacion, string> = {
  "no-disponible": "Aquí no se puede usar la ubicación del dispositivo.",
  denegada: "Tu celular no le está dando la ubicación a esta página, y por eso no te aparece la pregunta.",
  "sin-senal": "El GPS no respondió a tiempo. Acércate a una ventana o sal al aire libre y vuelve a medir.",
};

/** Dentro de una página publicada en Claude el navegador bloquea la ubicación. */
export const ubicacionDisponible = () =>
  "geolocation" in navigator && !(window as unknown as { claude?: unknown }).claude && window.isSecureContext;

type Oyente = (u: Ubicacion | null, e: ErrorUbicacion | null) => void;

/**
 * Vigilante del GPS: una sola suscripción para toda la app. Guarda la mejor lectura reciente
 * (la más precisa de los últimos 60 s) y avisa a quien esté escuchando.
 */
class VigilanteGps {
  private id: number | null = null;
  private mejor: Ubicacion | null = null;
  private error: ErrorUbicacion | null = null;
  private oyentes = new Set<Oyente>();

  /** Llamar desde un toque de la persona: así el navegador muestra el permiso. */
  iniciar() {
    if (this.id != null) return;
    if (!ubicacionDisponible()) {
      this.error = "no-disponible";
      return this.avisar();
    }
    this.error = null;
    this.id = navigator.geolocation.watchPosition(
      (p) => {
        const u = { lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy), hora: Date.now() };
        const vieja = !this.mejor || Date.now() - this.mejor.hora > 60000;
        if (vieja || u.precision <= this.mejor!.precision) this.mejor = u;
        this.error = null;
        this.avisar();
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          this.error = "denegada";
          this.detener();
        } else if (!this.mejor) {
          // Sin señal todavía: el vigilante sigue intentando, solo se informa
          this.error = "sin-senal";
        }
        this.avisar();
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
  }

  /** Vuelve a pedir la ubicación después de que la persona cambió el permiso. */
  reintentar() {
    this.detener();
    this.error = null;
    this.avisar();
    this.iniciar();
  }

  detener() {
    if (this.id != null) navigator.geolocation.clearWatch(this.id);
    this.id = null;
  }

  escuchar(f: Oyente) {
    this.oyentes.add(f);
    f(this.actual(), this.error);
    return () => {
      this.oyentes.delete(f);
    };
  }

  /** La mejor lectura si es reciente (menos de 2 minutos). */
  actual() {
    return this.mejor && Date.now() - this.mejor.hora < 120000 ? this.mejor : null;
  }

  /** Espera una lectura con la precisión pedida, o la mejor que haya al vencer el plazo. */
  esperar(maxMs: number, suficiente = 30): Promise<Ubicacion | null> {
    return new Promise((resolver) => {
      const ya = this.actual();
      if (ya && ya.precision <= suficiente) return resolver(ya);
      if (this.error === "denegada" || this.error === "no-disponible") return resolver(ya);
      let quitar = () => {};
      const t = setTimeout(() => {
        quitar();
        resolver(this.actual());
      }, maxMs);
      quitar = this.escuchar((u, e) => {
        if ((u && u.precision <= suficiente) || e === "denegada") {
          clearTimeout(t);
          queueMicrotask(() => quitar());
          resolver(u ?? this.actual());
        }
      });
    });
  }

  private avisar() {
    const u = this.actual();
    this.oyentes.forEach((f) => f(u, this.error));
  }
}

export const gps = new VigilanteGps();

/** Si el permiso ya estaba dado, el GPS se enciende solo al abrir la app. */
export async function encenderSiHayPermiso() {
  if (!ubicacionDisponible()) return;
  try {
    const p = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (p?.state === "granted") gps.iniciar();
  } catch {
    /* algunos navegadores no tienen la API de permisos: se pide al tocar Medir */
  }
}
