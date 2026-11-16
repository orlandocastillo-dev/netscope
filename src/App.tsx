import { useEffect, useState } from "react";
import { useMediciones } from "./lib/almacen";
import { detectarServidor, type ServidorPruebas } from "./lib/servidor";
import { Comparar } from "./pantallas/Comparar";
import { Historial } from "./pantallas/Historial";
import { Mapa } from "./pantallas/Mapa";
import { Medir } from "./pantallas/Medir";

const PANTALLAS = [
  { id: "medir", nombre: "Medir", icono: "M4 18a8 8 0 1 1 16 0M12 18l4-6" },
  { id: "mapa", nombre: "Mapa", icono: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" },
  { id: "comparar", nombre: "Wi-Fi vs. móvil", icono: "M7 4v16M7 4l-3 3M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" },
  { id: "historial", nombre: "Historial", icono: "M4 19h16M6 15l4-5 3 3 5-7" },
] as const;

type Id = (typeof PANTALLAS)[number]["id"];

const desdeHash = (): Id => {
  const h = location.hash.slice(1);
  return (PANTALLAS.some((p) => p.id === h) ? h : "medir") as Id;
};


export function App() {
  const [pantalla, setPantalla] = useState<Id>(desdeHash);
  const [servidor, setServidor] = useState<ServidorPruebas | null>(null);
  const datos = useMediciones();

  useEffect(() => {
    const f = () => setPantalla(desdeHash());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);

  useEffect(() => {
    detectarServidor().then(setServidor);
  }, []);

  const ir = (id: Id) => {
    location.hash = id;
    setPantalla(id);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <header className="cabecera">
        <a className="marca" href="#medir" onClick={() => ir("medir")}>
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="14" className="marca__anillo" />
            <path d="M8 19a8 8 0 0 1 16 0" className="marca__arco" />
            <path d="M16 19l5-6" className="marca__aguja" />
            <circle cx="16" cy="19" r="2.2" className="marca__centro" />
          </svg>
          <span>
            NetScope
            <small>Calidad de Wi-Fi y datos móviles</small>
          </span>
        </a>
      </header>

      <nav className="pestanas" aria-label="Pantallas">
        {PANTALLAS.map((p) => (
          <a key={p.id} href={`#${p.id}`} aria-current={pantalla === p.id ? "page" : undefined} onClick={(e) => (e.preventDefault(), ir(p.id))}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={p.icono} />
            </svg>
            <span>{p.nombre}</span>
          </a>
        ))}
      </nav>

      <main className="contenido">
        <h1 className="solo-lector">{PANTALLAS.find((p) => p.id === pantalla)?.nombre}</h1>
        {datos.error && <p className="alerta">{datos.error}</p>}
        {pantalla === "medir" && <Medir datos={datos} servidor={servidor} />}
        {pantalla === "mapa" && <Mapa datos={datos} irAMedir={() => ir("medir")} />}
        {pantalla === "comparar" && <Comparar datos={datos} irAMedir={() => ir("medir")} />}
        {pantalla === "historial" && <Historial datos={datos} />}
      </main>

      <footer className="pie">
        <p>
          NetScope · Proyecto integrador de Redes I, Universidad de la Costa (CUC). Las cifras salen de peticiones HTTP medidas desde el navegador: sirven para comparar puntos entre sí con el
          mismo navegador y el mismo servidor, no equivalen a un ping tradicional.
        </p>
      </footer>
    </div>
  );
}
