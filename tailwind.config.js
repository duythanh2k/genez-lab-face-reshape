/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: '#1A1A1A',
        'surface-2': '#242424',
        'surface-3': '#2E2E2E',
        accent: '#00D2FF',
        'text-primary': '#FFFFFF',
        'text-secondary': '#AAAAAA',
        'text-muted': '#666666',
      },
    },
  },
  plugins: [],
};
