export type TipoRed = "wifi" | "movil";
export type Tecnologia = "" | "3G" | "4G" | "5G";

/** Lo que el navegador alcanza a decir de la red (Network Information API). Solo estimaciones. */
export interface InfoNavegador {
  tipo?: string;
  efectivo?: string;
  downlink?: number;
  rtt?: number;
}

export interface Medicion {
  id: string;
  fecha: string;
  lugar: string;
  tipo: TipoRed;
  tecnologia: Tecnologia;
  /** Ubicación GPS, cuando el navegador la entrega. */
  lat: number | null;
  lng: number | null;
  /** Radio de incertidumbre del GPS, en metros. */
  precision: number | null;
  /** La persona movió el punto a mano, dentro del margen de error del GPS. */
  ajustada?: boolean;
  /** Dónde la puso el GPS, para no dejar mover el punto más allá de su margen de error. */
  origen?: { lat: number; lng: number };
  /** Punto en el plano (de 0 a 1), solo cuando no hubo GPS y se marcó a mano. */
  x: number | null;
  y: number | null;
  latencia: number;
  jitter: number;
  perdida: number;
  descarga: number;
  /** null cuando el servidor de pruebas no permite medir la subida. */
  subida: number | null;
  senal: number | null;
  estabilidad: number;
  puntaje: number;
  ligera: boolean;
  ejemplo: boolean;
  /** Contra qué se midió: el servidor del proyecto o los archivos de la página publicada. */
  servidor: "api" | "estatico" | "simulado";
  navegador?: InfoNavegador;
}

export type NuevaMedicion = Omit<Medicion, "id" | "fecha" | "estabilidad" | "puntaje">;
