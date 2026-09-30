// Os tons vêm de variáveis CSS (src/tema.css), que trocam de valor no modo escuro.
const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const variavel = (nome) =>
  Object.fromEntries(TONS.map((t) => [t, `rgb(var(--${nome}-${t}) / <alpha-value>)`]))

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Geist vem empacotada via @fontsource (importada no main.tsx), então funciona em rede fechada.
        sans: ['"Geist Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      colors: {
        // Azul da logo (#03A9E5) como cor de marca; valores em src/tema.css.
        brand: variavel('brand'),
        slate: variavel('slate'),
        red: variavel('red'),
        emerald: variavel('emerald'),
        amber: variavel('amber'),
        sky: variavel('sky'),
        violet: variavel('violet'),
        // Fundo de cards e campos: branco no claro, grafite no escuro.
        surface: 'rgb(var(--surface) / <alpha-value>)',
        // Verde da logo, usado só como sinal de "ao vivo".
        signal: '#00E696',
        ink: {
          700: '#1E273D',
          800: '#141B2D',
          900: '#0B1120',
          950: '#070B14',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.03)',
        'card-hover': '0 4px 8px -2px rgb(16 24 40 / 0.06), 0 12px 24px -8px rgb(16 24 40 / 0.10)',
        soft: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
        'soft-hover': '0 4px 12px -2px rgb(16 24 40 / 0.10)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        sumir: {
          '0%': { opacity: '1', scale: '1' },
          '100%': { opacity: '0', scale: '1.8' },
        },
      },
      animation: {
        'fade-in': 'fadeInUp .4s cubic-bezier(0.16, 1, 0.3, 1) both',
        sumir: 'sumir .5s ease-out forwards',
      },
    },
  },
  // Obrigatório, não enfeite: os inputs do protótipo usam "rounded-md border-slate-300"
  // sem classe de largura de borda. No CDN o input herda a borda nativa do navegador; num
  // build local o preflight zera border-width e os campos ficam sem borda visível.
  plugins: [require('@tailwindcss/forms')],
}
