import { useEffect, useState } from "react";
import { Entrada, entradaVista } from "./componentes/Entrada";
import { useMediciones } from "./lib/almacen";
import { detectarServidor, type ServidorPruebas } from "./lib/servidor";
import { Comparar } from "./pantallas/Comparar";
import { Historial } from "./pantallas/Historial";
import { Mapa } from "./pantallas/Mapa";
import { Medir } from "./pantallas/Medir";

const PANTALLAS = [
  { id: "medir", nombre: "Medir", titulo: "Medir", icono: "M4.5 16.5a8 8 0 1 1 15 0M12 16l3.5-5" },
  { id: "mapa", nombre: "Mapa", titulo: "Mapa de cobertura", icono: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" },
  { id: "comparar", nombre: "Comparar", titulo: "Wi-Fi o datos móviles", icono: "M8 4v16M8 4 5 7M8 4l3 3M16 20V4M16 20l-3-3M16 20l3-3" },
  { id: "historial", nombre: "Historial", titulo: "Historial", icono: "M4 19h16M5 15l4.5-5 3.5 3 6-7" },
] as const;

type Id = (typeof PANTALLAS)[number]["id"];

const desdeHash = (): Id => {
  const h = location.hash.slice(1);
  return (PANTALLAS.some((p) => p.id === h) ? h : "medir") as Id;
};

/** Marca de NetScope: el dial del escáner reducido a su mínima expresión. */
export function Marca({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.2 17.5A9 9 0 1 1 19.8 17.5" />
      <path d="M7.6 15.6a5 5 0 1 1 8.8 0" />
      <path d="M12 14.5 16 9" />
      <circle cx="12" cy="14.5" r="1.6" />
    </svg>
  );
}

export function App() {
  const [pantalla, setPantalla] = useState<Id>(desdeHash);
  const [servidor, setServidor] = useState<ServidorPruebas | null>(null);
  const [entrada, setEntrada] = useState(() => !entradaVista());
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

  const actual = PANTALLAS.find((p) => p.id === pantalla)!;

  return (
    <>
      {entrada && <Entrada onEntrar={() => setEntrada(false)} />}
      <div className="app" aria-hidden={entrada || undefined}>
        <aside className="lateral">
          <a className="marca" href="#medir" onClick={(e) => (e.preventDefault(), ir("medir"))}>
            <Marca className="marca__dial" />
            NetScope
          </a>
          <nav className="navegacion" aria-label="Pantallas">
            {PANTALLAS.map((p) => (
              <a key={p.id} href={`#${p.id}`} aria-current={pantalla === p.id ? "page" : undefined} onClick={(e) => (e.preventDefault(), ir(p.id))}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d={p.icono} />
                </svg>
                <span>{p.nombre}</span>
              </a>
            ))}
          </nav>
        </aside>

        <header className="barra">
          <a className="marca marca--barra" href="#medir" onClick={(e) => (e.preventDefault(), ir("medir"))} aria-label="NetScope, ir a Medir">
            <Marca className="marca__dial" />
          </a>
          <h1 className="barra__titulo">{actual.titulo}</h1>
          <span className="barra__estado">{datos.lista.length ? `${datos.lista.length} ${datos.lista.length === 1 ? "medición" : "mediciones"}` : "Sin mediciones"}</span>
        </header>

        <main className="lienzo">
          {datos.error && <p className="alerta">{datos.error}</p>}
          {pantalla === "medir" && <Medir datos={datos} servidor={servidor} />}
          {pantalla === "mapa" && <Mapa datos={datos} irAMedir={() => ir("medir")} />}
          {pantalla === "comparar" && <Comparar datos={datos} irAMedir={() => ir("medir")} />}
          {pantalla === "historial" && <Historial datos={datos} />}
        </main>
      </div>
    </>
  );
}
