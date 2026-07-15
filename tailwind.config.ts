import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dbe6fe',
          500: '#3b63f3',
          600: '#2547d0',
          700: '#1f39a8',
          900: '#182a6e',
        },
      },
    },
  },
  plugins: [],
};
export default config;
