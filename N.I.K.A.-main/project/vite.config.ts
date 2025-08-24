import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: [
      'lucide-react',      // keep your existing exclusion
      'jspdf',
      'jspdf-autotable',
      'xlsx',
      'pptxgenjs',
      'chart.js'
    ],
  },
});
