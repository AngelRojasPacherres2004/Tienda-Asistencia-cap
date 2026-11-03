import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.DASHBOARD_DEV_API_PORT || 8788}`,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyRes", proxyResponse => {
            // Let the proxy stream the response instead of trusting an upstream
            // length that can become stale after response transformations.
            delete proxyResponse.headers["content-length"];
            delete proxyResponse.headers.connection;
          });
        },
      },
    },
  },
});
