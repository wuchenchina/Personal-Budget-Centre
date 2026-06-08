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
              priority: 60,
            },
            {
              name: 'vendor-antd-pro',
              test: /node_modules[\\/]@ant-design[\\/]pro-/,
              priority: 55,
            },
            {
              name: 'vendor-antd-icons',
              test: /node_modules[\\/]@ant-design[\\/](icons|icons-svg)[\\/]/,
              priority: 54,
            },
            {
              name: 'vendor-antd-theme',
              test: /node_modules[\\/](@ant-design[\\/](colors|cssinjs|cssinjs-utils|fast-color)|antd[\\/]es[\\/](config-provider|locale|theme|style|version|_util))[\\/]/,
              priority: 53,
            },
            {
              name: 'vendor-antd-form',
              test: /node_modules[\\/](antd[\\/]es[\\/](auto-complete|checkbox|date-picker|form|input|input-number|radio|select|switch)|@rc-component[\\/](async-validator|checkbox|form|input|input-number|mini-decimal|picker|select|switch)|rc-field-form|rc-input|rc-input-number|rc-picker|rc-select)[\\/]/,
              priority: 52,
            },
            {
              name: 'vendor-antd-overlay',
              test: /node_modules[\\/](antd[\\/]es[\\/](drawer|message|modal|notification|popconfirm|popover|tooltip)|@rc-component[\\/](dialog|drawer|motion|notification|portal|tooltip|trigger)|rc-dialog|rc-motion|rc-tooltip|rc-trigger)[\\/]/,
              priority: 51,
            },
            {
              name: 'vendor-antd-data',
              test: /node_modules[\\/](antd[\\/]es[\\/](descriptions|empty|pagination|progress|result|spin|statistic|table)|@rc-component[\\/](pagination|progress|resize-observer|table|virtual-list)|rc-pagination|rc-table|rc-virtual-list)[\\/]/,
              priority: 50,
            },
            {
              name: 'vendor-antd-navigation',
              test: /node_modules[\\/](antd[\\/]es[\\/](breadcrumb|layout|menu|segmented|tabs)|@rc-component[\\/](menu|overflow|segmented|tabs)|rc-menu|rc-overflow|rc-tabs)[\\/]/,
              priority: 49,
            },
            {
              name: 'vendor-antd-basic',
              test: /node_modules[\\/](antd[\\/]es[\\/](alert|avatar|button|card|divider|flex|grid|skeleton|space|tag|typography)|@rc-component[\\/](context|dropdown|mutate-observer|util)|react-draggable|scroll-into-view-if-needed|compute-scroll-into-view)[\\/]/,
              priority: 48,
            },
            {
              name: 'vendor-antd-core',
              test: /node_modules[\\/](antd|@ant-design|@rc-component|rc-[^\\/]+)[\\/]/,
              priority: 45,
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
