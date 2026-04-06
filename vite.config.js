import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  envPrefix: ["VITE_", "annotator_"],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5000",
    },
  },
});
