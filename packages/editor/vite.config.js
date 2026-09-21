import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
    plugins: [react()],
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.js"),
            name: "ReactVideoTimelineEditor",
            formats: ["es", "cjs"],
            fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
        },
        rollupOptions: {
            external: ["react", "react-dom", "react/jsx-runtime", "lucide-react"],
            output: {
                assetFileNames: (asset) => (asset.name?.endsWith(".css") ? "style.css" : "assets/[name][extname]"),
            },
        },
    },
});
