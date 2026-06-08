import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
              maxSize: 360 * 1024,
            },
            {
              name: 'vendor-antd-core',
              test: /node_modules[\\/](antd)[\\/]/,
              priority: 35,
              maxSize: 360 * 1024,
            },
            {
              name: 'vendor-ant-design',
              test: /node_modules[\\/](@ant-design|@rc-component)[\\/]/,
              priority: 34,
              maxSize: 360 * 1024,
            },
            {
              name: 'vendor-rc',
              test: /node_modules[\\/](rc-|react-draggable|scroll-into-view-if-needed|compute-scroll-into-view)/,
              priority: 33,
              maxSize: 360 * 1024,
            },
            {
              name: 'vendor-utils',
              test: /node_modules[\\/](dayjs|lucide-react|clsx|lodash-es|swr)[\\/]/,
              priority: 30,
              maxSize: 240 * 1024,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
              maxSize: 360 * 1024,
            },
          ],
        },
      },
    },
  },
});
