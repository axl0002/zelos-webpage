import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {fileURLToPath} from "node:url";
export default defineConfig({base:"./",plugins:[react()],resolve:{alias:{"@":fileURLToPath(new URL("../../src",import.meta.url))}},build:{outDir:"/tmp/zelos-admin-analytics-preview",emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL("analytics-preview.html",import.meta.url))}}});
