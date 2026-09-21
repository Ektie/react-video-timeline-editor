import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import * as esbuild from "esbuild";
import { resolve } from "node:path";

/** Source files are JSX in `.js` (Next/webpack hosts already transpile them). */
function jsxInJs() {
    return {
        name: "jsx-in-js",
        enforce: "pre",
        async transform(code, id) {
            if (id.includes("node_modules")) return null;
            if (!id.endsWith(".js") || !id.includes("/src/")) return null;
            const result = await esbuild.transform(code, {
                loader: "jsx",
                jsx: "automatic",
                sourcefile: id,
                sourcemap: true,
            });
            return { code: result.code, map: result.map };
        },
    };
}

export default defineConfig({
    plugins: [jsxInJs(), react()],
    build: {
        emptyOutDir: true,
        cssCodeSplit: false,
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
                exports: "named",
            },
        },
    },
});
