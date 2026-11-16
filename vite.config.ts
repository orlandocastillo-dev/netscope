import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" para que funcione igual servida por Express, en Vercel o publicada en Claude
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    // En desarrollo, las rutas /api van al servidor Express
    proxy: { "/api": "http://localhost:3000" },
  },
});
