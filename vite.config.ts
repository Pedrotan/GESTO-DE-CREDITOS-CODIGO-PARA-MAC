import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import obfuscator from 'vite-plugin-javascript-obfuscator';

function lookupDocumentDevPlugin() {
  return {
    name: 'lookup-document-dev-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/lookup-document', async (req: any, res: any) => {
        try {
          const url = new URL(req.url, `http://${req.headers.host || 'localhost:8081'}`);
          const document = (url.searchParams.get('document') || '').trim();
          const type = (url.searchParams.get('type') || 'SINGULAR').toUpperCase();

          const handlerModule = await import('./vercel-api/lookup-document.js');
          const mockReq = { method: 'GET', query: { document, type } };
          const mockRes = {
            status(code: number) { res.statusCode = code; return this; },
            setHeader(name: string, val: string) { res.setHeader(name, val); return this; },
            json(data: any) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify(data));
            }
          };
          await handlerModule.default(mockReq, mockRes);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ success: false, message: err?.message || 'Erro no lookup dev' }));
        }
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    host: "::",
    port: 8081,
    watch: {
      ignored: [
        "**/vercel-web/**",
        "**/release/**",
        "**/release-admin/**",
        "**/dist/**",
        "**/dist-electron/**",
        "**/scratch/**",
      ],
    },
    // Testes de sincronização: encaminha /api para um servidor local que corre o código de vercel-api.
    proxy: process.env.TANGO_DEV_API_PROXY ? { "/api": process.env.TANGO_DEV_API_PROXY } : undefined,
  },
  optimizeDeps: {
    entries: ["index.html"],
  },
  plugins: [
    react(),
    lookupDocumentDevPlugin(),
    mode === "development" ? componentTagger() : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
