import { useEffect, useState } from "react";

const VISTA = "netscope:entrada";

const yaSeVio = () => {
  try {
    return sessionStorage.getItem(VISTA) === "1";
  } catch {
    return false;
  }
};

/** El dial del escáner: anillos de alcance y un barrido, como el de un radar que busca señal. */
function Escaner() {
  return (
    <svg className="escaner" viewBox="0 0 320 320" aria-hidden="true">
      {[150, 112, 74, 36].map((r) => (
        <circle key={r} cx="160" cy="160" r={r} className="escaner__anillo" />
      ))}
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i / 60) * Math.PI * 2;
        const largo = i % 5 === 0 ? 10 : 5;
        return <line key={i} x1={160 + Math.cos(a) * 150} y1={160 + Math.sin(a) * 150} x2={160 + Math.cos(a) * (150 - largo)} y2={160 + Math.sin(a) * (150 - largo)} className="escaner__marca" />;
      })}
      <g className="escaner__barrido">
        <path d="M160 160 L160 10 A150 150 0 0 1 266 54 Z" className="escaner__estela" />
        <line x1="160" y1="160" x2="160" y2="10" className="escaner__aguja" />
      </g>
      {/* Puntos medidos que aparecen al pasar el barrido */}
      <circle cx="214" cy="96" r="6" className="escaner__punto escaner__punto--bueno" style={{ animationDelay: "0.35s" }} />
      <circle cx="232" cy="198" r="6" className="escaner__punto escaner__punto--regular" style={{ animationDelay: "0.95s" }} />
      <circle cx="118" cy="236" r="6" className="escaner__punto escaner__punto--bajo" style={{ animationDelay: "1.6s" }} />
      <circle cx="104" cy="112" r="6" className="escaner__punto escaner__punto--bueno" style={{ animationDelay: "2.25s" }} />
      <circle cx="160" cy="160" r="5" className="escaner__centro" />
    </svg>
  );
}

export function Entrada({ onEntrar }: { onEntrar: () => void }) {
  const [saliendo, setSaliendo] = useState(false);
  const entrar = () => {
    try {
      sessionStorage.setItem(VISTA, "1");
    } catch {
      /* sin almacenamiento: se vuelve a mostrar la próxima vez */
    }
    setSaliendo(true);
    setTimeout(onEntrar, 380);
  };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Enter" && entrar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });
  return (
    <div className={`entrada${saliendo ? " entrada--sale" : ""}`}>
      <div className="entrada__visual">
        <Escaner />
      </div>
      <div className="entrada__texto">
        <h1 className="entrada__nombre">NetScope</h1>
        <p className="entrada__frase">Mide tu Wi-Fi y tus datos móviles en cada rincón, y descubre cuál conviene dónde.</p>
        <button type="button" className="pildora pildora--grande" onClick={entrar} autoFocus>
          Empezar
        </button>
        <p className="entrada__pie">Proyecto de Redes I · Universidad de la Costa</p>
      </div>
    </div>
  );
}

export { yaSeVio as entradaVista };
