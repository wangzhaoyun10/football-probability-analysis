/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#101827',
        'panel-soft': '#172033',
        line: '#273247',
        cyanx: '#29d3ff',
        greenx: '#28e6a7',
        amberx: '#f7c948',
        redx: '#ff6b7a',
      },
      boxShadow: {
        glow: '0 16px 48px rgba(18, 213, 255, 0.12)',
      },
    },
  },
  plugins: [],
};
