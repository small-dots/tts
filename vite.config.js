import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: true } },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("ant-design-vue") || id.includes("@ant-design"))
            return "ui";
          if (id.includes("node_modules/vue") || id.includes("@vue"))
            return "vue";
        },
      },
    },
  },
});
