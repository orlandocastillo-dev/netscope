// Recibe el bloque de la prueba de subida, cuenta los bytes y los descarta.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });
  let bytes = 0;
  for await (const trozo of req) bytes += trozo.length;
  res.status(200).json({ bytes });
}
