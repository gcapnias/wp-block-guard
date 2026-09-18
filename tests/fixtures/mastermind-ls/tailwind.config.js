/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './templates/**/*.html',
    './parts/**/*.html',
    './patterns/**/*.php',
    './pages/**/*.html',
    './**/*.php',
  ],
  theme: {
    extend: {
      colors: {
        violet: { DEFAULT: '#931a81', dark: '#6b1260', deep: '#3d0a37' },
        green: { DEFAULT: '#01983d', dark: '#017a30' },
        tango: { DEFAULT: '#f38612', dark: '#d06a00' },
        venus: '#918891',
        athens: '#eae9ed',
        dark: { bg: '#1a0a18', surface: '#2a1228' },
        mls: { bg: '#f8f7fa', surface: '#ffffff', text: '#1a0818', muted: '#5a4d58' },
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['Lora', 'serif'],
      },
      borderRadius: {
        pill: '9999px',
        card: '16px',
        btn: '12px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(147,26,129,0.10), 0 1px 4px rgba(0,0,0,0.06)',
        'card-hover': '0 12px 40px rgba(147,26,129,0.22), 0 2px 8px rgba(0,0,0,0.10)',
        header: '0 2px 16px rgba(147,26,129,0.15)',
      },
      keyframes: {
        fadeUp: { from: { opacity: '0', transform: 'translateY(20px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        drift: { '0%,100%': { transform: 'translateY(0) rotate(-2deg)' }, '50%': { transform: 'translateY(-12px) rotate(1deg)' } },
        blobPulse: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.15)' } },
        owlFloat: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
      },
      animation: {
        'fade-up': 'fadeUp 0.55s cubic-bezier(0.34,1.56,0.64,1) both',
        drift: 'drift 8s ease-in-out infinite',
        'blob-pulse': 'blobPulse 6s ease-in-out infinite',
        'owl-float': 'owlFloat 4s ease-in-out infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
