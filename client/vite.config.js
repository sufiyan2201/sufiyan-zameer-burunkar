import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development, anything the React app requests under /api is forwarded to the
// Express server, so the browser only ever talks to http://localhost:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
