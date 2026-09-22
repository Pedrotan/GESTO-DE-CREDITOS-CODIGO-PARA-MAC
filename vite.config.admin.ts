import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
    base: './',
    root: './',
    build: {
        outDir: 'dist-admin',
        rollupOptions: {
            input: {
                "index-admin": path.resolve(__dirname, 'index-admin.html'),
            }
        }
    },
    server: {
        host: "::",
        port: 8082,
        strictPort: true,
    },
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
}));
