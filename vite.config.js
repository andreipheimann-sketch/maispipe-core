import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // VITE_CLIENT e lida automaticamente pelo Vite (prefixo VITE_ e exposto ao bundle).
  // Nao e necessario declarar aqui — so garantir que esteja no Vercel env vars.
});
