/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: {
            DEFAULT: '#0c3e35',
            hover: '#072923',
            dark: '#05261e',
            darker: '#031814',
            light: '#165b4f',
          },
          gold: {
            DEFAULT: '#d4af37',
            muted: '#c5a059',
            light: '#f5e8c7',
          },
          card: '#edece4',
          sand: '#f4f3ed',
          border: '#d2d1c9',
          muted: '#5e736e',
        },
        success: {
          50: '#ecfdf3',
          100: '#d1fadf',
          200: '#a6f4c5',
          500: '#12b76a',
          600: '#039855',
          700: '#027a48',
          800: '#05603a',
        },
        warning: {
          50: '#fffaeb',
          100: '#fef0c7',
          500: '#f79009',
          600: '#dc6803',
          700: '#b54708',
        },
        error: {
          50: '#fef3f2',
          100: '#fee4e2',
          500: '#f04438',
          600: '#d92d20',
          700: '#b42318',
        }
      },
      fontFamily: {
        sans: ['var(--font-qomra)', 'Tajawal', 'Cairo', 'sans-serif'],
        qomra: ['var(--font-qomra)', 'sans-serif'],
      },
      boxShadow: {
        'brand-card': '0 20px 50px -12px rgba(3, 24, 20, 0.15)',
        'brand-float': '0 10px 30px -5px rgba(5, 38, 30, 0.12)',
        'brand-glow': '0 0 25px rgba(212, 175, 55, 0.25)',
      },
      borderRadius: {
        '3xl': '1.75rem',
        '4xl': '2rem',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
}
