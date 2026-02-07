/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        sand: '#F6F1E9',
        linen: '#FBF9F5',
        'warm-linen': '#FBF9F5',
        stone: '#E6DFD4',
        driftwood: '#CBBFAF',
        'sea-glass': '#9FBFBB',
        'deep-ocean': '#2F4F4F',
        charcoal: '#1F2933',
        'gold-accent': '#D9C7A1',
        'soft-gold': '#D9C7A1',
      },
    },
  },
  plugins: [],
};
