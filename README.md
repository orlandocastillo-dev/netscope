# NetScope

Prototipo web para diagnosticar y comparar la calidad de conexiones **Wi-Fi** y de **datos móviles**, punto por punto. Proyecto integrador de Redes I, Universidad de la Costa (CUC).

Mide latencia, jitter, pérdida, descarga, subida y estabilidad; calcula un puntaje de 0 a 100 (Tabla 3 del informe); dibuja un mapa de cobertura; compara Wi-Fi contra datos móviles y guarda el historial.

## Pantallas

- **Medir**: lugar, tipo de conexión (y 3G/4G/5G), señal en dBm opcional, punto en el plano y prueba normal o ligera.
- **Mapa**: mapa de calor por interpolación de distancia inversa (IDW). Se desvanece donde no hay mediciones.
- **Wi-Fi vs. móvil**: promedios lado a lado, veredicto (menos de 5 puntos = similar), por tecnología y por lugar.
- **Historial**: evolución del puntaje, tabla, exportación a CSV y datos de ejemplo.

## Tecnologías

| Parte | Tecnología |
| --- | --- |
| Interfaz | React 18 + TypeScript, compilada con Vite |
| Gráficos | SVG (medidor, historial) y canvas (mapa de calor) |
| Servidor | Node.js 22 + Express |
| Base de datos | SQLite (`node:sqlite`, incluido en Node) |
| Pruebas | `node:test` (servidor y puntaje) y Playwright (interfaz) |

## Uso

Requiere Node.js 22.18 o superior.

```bash
npm install
npm start        # compila la interfaz y arranca el servidor en http://localhost:3000
npm run prueba   # pruebas del servidor y del puntaje
npm run dev      # desarrollo (en otra terminal: npm run servidor)
```

Para medir desde el celular, conéctalo a la misma red Wi-Fi y abre `http://<IP del computador>:3000`. Así se mide la cobertura Wi-Fi hasta ese computador. Para medir datos móviles reales el servidor debe estar publicado en internet.

## Dónde se guardan las mediciones

La app lo elige sola:

1. **Publicada en Claude**: en la base de datos del artefacto, compartida entre todos los dispositivos del equipo.
2. **Con el servidor del proyecto**: en SQLite (`datos/netscope.db`). El servidor valida cada medición y recalcula el puntaje.
3. **Sin ninguno**: solo en el navegador.

## Limitaciones (iguales a las del informe)

- Las cifras salen de peticiones HTTP cronometradas: sirven para comparar puntos con el mismo navegador y servidor, no equivalen a un ping ICMP.
- El navegador no lee la señal en dBm ni distingue 4G de 5G: se ingresan a mano.
- En la versión publicada en Claude se mide contra los archivos de la propia página, y la subida no se puede medir porque una página estática no recibe datos.

## API del servidor

| Ruta | Para qué |
| --- | --- |
| `GET /api/estado` | Comprobar que el servidor responde |
| `GET /api/ping` | Latencia |
| `GET /api/descarga?mb=5` | Bloque de bytes aleatorios |
| `POST /api/subida` | Recibe y descarta bytes |
| `GET/POST /api/mediciones` | Listar y guardar mediciones |
| `DELETE /api/mediciones/:id` | Borrar una |
| `DELETE /api/mediciones?solo=ejemplos` | Borrar los ejemplos |
| `GET /api/estadisticas` | Promedios por tipo de conexión |
