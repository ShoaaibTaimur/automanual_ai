import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: '#6366f1',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#1e293b',
          foreground: '#f8fafc',
        },
        muted: {
          DEFAULT: '#0f172a',
          foreground: '#94a3b8',
        },
        accent: {
          DEFAULT: '#38bdf8',
          foreground: '#0f172a',
        },
        card: {
          DEFAULT: '#0b0f19',
          foreground: '#f8fafc',
        },
      },
    },
  },
  plugins: [],
};

export default config;
