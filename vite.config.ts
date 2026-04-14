import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: true, // 👈 MELHOR QUE "::" para LAN
    port: 8080,

    // 🔥 LIBERA DOMÍNIO LOCAL
    allowedHosts: [
      "bingo.lan",
      "supabase.lan",
      "bingo.up",
      ".lan",
      ".up",
      "localhost"
    ],

    watch: {
      usePolling: true,
      interval: 100,
    },

    hmr: {
      overlay: true,
    },
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));