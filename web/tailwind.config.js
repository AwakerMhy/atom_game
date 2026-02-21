/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#181c20',
        cell: '#f5ebd2',
        frame: '#50463c',
        atom: {
          black: '#2a2a30',
          red: '#c84646',
          blue: '#4678c8',
          green: '#46a064',
        },
      },
    },
  },
  plugins: [],
}
