// En Vercel no hay base de datos: cada celular guarda sus mediciones.
// Esta ruta le dice a la app que hay servidor para medir la subida, pero no para guardar.
export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ netscope: true, almacen: false });
}
