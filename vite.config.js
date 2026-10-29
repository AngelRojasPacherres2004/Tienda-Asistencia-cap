import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

const commercialRoot = resolve("commercial-dashboard/dist/dashboard-web/browser");
const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

function commercialDevAssets() {
  return {
    name: "commercial-dev-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname;
        try { pathname = decodeURIComponent((request.url || "").split("?")[0]); }
        catch { response.statusCode = 400; response.end("Ruta inválida."); return; }
        if (!pathname.startsWith("/comercial/")) return next();
        const relative = pathname.slice("/comercial/".length) || "index.html";
        const file = resolve(commercialRoot, relative);
        if (!file.startsWith(`${commercialRoot}${sep}`) || !existsSync(file) || !statSync(file).isFile()) {
          response.statusCode = 404;
          response.end("El dashboard comercial no está compilado. Ejecuta npm run build:commercial.");
          return;
        }
        const extension = file.slice(file.lastIndexOf("."));
        response.setHeader("Content-Type", contentTypes[extension] || "application/octet-stream");
        response.setHeader("Cache-Control", "no-store");
        createReadStream(file).pipe(response);
      });
    },
  };
}

function commercialReactRuntime() {
  const adapter = resolve('commercial-dashboard/src/app/reactivity-react.ts');
  return {
    name: 'commercial-react-runtime',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === '@angular/core' && importer?.replaceAll('\\', '/').includes('/commercial-dashboard/src/app/')) return adapter;
    },
  };
}

export default defineConfig({
  plugins: [commercialReactRuntime(), react(), commercialDevAssets()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.DASHBOARD_DEV_API_PORT || 8788}`,
    },
  },
});
