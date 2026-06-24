/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'PingFang SC',
          'PingFang TC',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Microsoft YaHei',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // 飞书 / 火山引擎（Lark / Arco）品牌蓝
        brand: {
          50: '#EAF1FF',
          100: '#D9E5FF',
          200: '#B7CEFF',
          300: '#94B4FF',
          400: '#6E97FF',
          500: '#4C82FF',
          600: '#3370FF',
          700: '#2860E1',
          800: '#1E50C2',
          900: '#163F9E',
          DEFAULT: '#3370FF',
        },
        // 把默认 blue 重映射到 Lark 蓝，使全站既有的 blue-600 等强调色自动统一
        blue: {
          50: '#EAF1FF',
          100: '#D9E5FF',
          200: '#B7CEFF',
          300: '#94B4FF',
          400: '#6E97FF',
          500: '#4C82FF',
          600: '#3370FF',
          700: '#2860E1',
          800: '#1E50C2',
          900: '#163F9E',
        },
        // 飞书中性色（文本 / 分割线 / 画布）
        ink: {
          DEFAULT: '#1F2329',
          secondary: '#646A73',
          tertiary: '#8F959E',
          disabled: '#BBBFC4',
        },
        line: {
          DEFAULT: '#DEE0E3',
          soft: '#EFF0F1',
        },
        canvas: '#F5F6F7',
      },
      boxShadow: {
        card: '0 1px 3px rgba(31, 35, 41, 0.06), 0 1px 2px rgba(31, 35, 41, 0.04)',
        'card-hover': '0 6px 16px rgba(31, 35, 41, 0.10), 0 2px 4px rgba(31, 35, 41, 0.06)',
        pop: '0 8px 24px rgba(31, 35, 41, 0.14)',
      },
    },
  },
  plugins: [],
}
