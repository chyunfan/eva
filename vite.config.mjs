import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 构建输出到项目根目录 dist/，后端静态托管该目录（见 server/index.js）。
// 开发时 dev 服务器代理 /api 到后端（默认 3000 端口）。
export default defineConfig({
  plugins: [vue()],
  // 部署到网关子路径时，用 VITE_BASE 指定挂载前缀，例如 /dept-eval/
  // 本地或根路径部署可省略（默认 '/'）
  base: process.env.VITE_BASE || '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
