import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {fileURLToPath} from 'node:url';
export default defineConfig({root:fileURLToPath(new URL('.',import.meta.url)),plugins:[react()],build:{outDir:'dist',emptyOutDir:true},server:{proxy:{'/api':process.env.API_PROXY??'http://localhost:3001'}}});
