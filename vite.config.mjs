import { defineConfig,loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {readFileSync} from 'node:fs';
import {createTrafficService,trafficMiddleware} from './server/traffic.mjs';
const service=createTrafficService({airports:JSON.parse(readFileSync(new URL('./public/data/airports.json',import.meta.url))),cachePath:new URL('./.cache/traffic-cache.json',import.meta.url).pathname,contact:process.env.AIRFIELD_CONTACT||loadEnv('development',process.cwd(),'AIRFIELD_').AIRFIELD_CONTACT});
const traffic={name:'public-airport-traffic',configureServer(server){server.middlewares.use(trafficMiddleware(service));},configurePreviewServer(server){server.middlewares.use(trafficMiddleware(service));}};

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(),traffic],
});
