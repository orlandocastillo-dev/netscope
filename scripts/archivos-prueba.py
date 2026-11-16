# Crea los archivos contra los que mide la versión publicada como página estática:
# - ping.txt: diminuto, para la latencia
# - bloque-1mb.png y bloque-5mb.png: imágenes de ruido aleatorio. El ruido no se puede comprimir,
#   así que lo que pesa el archivo es lo que de verdad viaja por la red.
import os, sys
import numpy as np
from PIL import Image

salida = sys.argv[1]
os.makedirs(salida, exist_ok=True)
with open(os.path.join(salida, "ping.txt"), "w") as f:
    f.write("ok")
rng = np.random.default_rng(7)
for mb, lado in ((1, 592), (5, 1324)):
    datos = rng.integers(0, 256, size=(lado, lado, 3), dtype=np.uint8)
    ruta = os.path.join(salida, f"bloque-{mb}mb.png")
    Image.fromarray(datos).save(ruta, compress_level=0)
    print(ruta, round(os.path.getsize(ruta) / 1048576, 2), "MB")
