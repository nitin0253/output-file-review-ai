/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {},
  },
  // Safelist arbitrary classes assembled in JS strings so JIT keeps them.
  // Most dynamic colors are built via inline `style="background:..."` instead of
  // Tailwind classes, so this list stays small. Add any class string that only
  // appears inside concatenated JS templates here.
  safelist: [
    'ai-fab',
    'visible',
    'active',
    'modal-overlay',
    { pattern: /^grid-cols-(\d+)$/, variants: ['md', 'lg'] },
  ],
  plugins: [],
};
