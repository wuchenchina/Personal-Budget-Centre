import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-antd-core',
              test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+|react-draggable|scroll-into-view-if-needed|compute-scroll-into-view)[\\/]/,
              priority: 35,
            },
            {
              name: 'vendor-utils',
              test: /node_modules[\\/](dayjs|lucide-react|clsx|lodash-es|swr)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor',
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
