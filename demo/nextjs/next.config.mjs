import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const editorSrc = path.resolve(here, "../../packages/editor/src");

/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@ektie/react-video-timeline-editor"],
    webpack: (config) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            "@ektie/react-video-timeline-editor/style.css": path.join(editorSrc, "styles.css"),
            "@ektie/react-video-timeline-editor$": path.join(editorSrc, "index.js"),
        };
        return config;
    },
};

export default nextConfig;
