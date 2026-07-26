import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // rutas relativas: funciona igual en localhost, en GitHub Pages (/repo/) y en cualquier subcarpeta
  base: "./",
  server: { port: 5173, open: true },
});
