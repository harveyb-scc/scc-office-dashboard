import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Display"',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Brand colours from task spec
        white: '#FFFFFF',
        'off-white': '#F5F5F7',
        'text-primary': '#1D1D1F',
        'text-secondary': '#6E6E73',
        'accent-blue': '#0071E3',

        // Apple semantic system colours (light mode)
        'bg-primary': '#FFFFFF',
        'bg-secondary': '#F2F2F7',
        'bg-tertiary': '#EFEFF4',

        'system-blue': '#007AFF',
        'system-green': '#34C759',
        'system-orange': '#FF9500',
        'system-red': '#FF3B30',
        'system-grey': '#8E8E93',
        'system-grey-2': '#AEAEB2',
        'system-grey-3': '#C7C7CC',
        'system-grey-4': '#D1D1D6',
        'system-grey-5': '#E5E5EA',
        'system-grey-6': '#F2F2F7',

        'label-primary': '#000000',
        'label-secondary': '#636366',
        'label-tertiary': '#A2A2A7',

        // Accessible success text (Imogen's contrast fix: white on #34C759 fails at 2.2:1)
        // Use #248A3D for success text on white backgrounds
        'success-text': '#248A3D',

        // Direct hex references for programmatic use
        success: '#34C759',
        warning: '#FF9F0A',
        error: '#FF3B30',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        md: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
        lg: '0 10px 25px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.08)',
        none: 'none',
      },
      spacing: {
        // 8pt grid: multiples of 4px
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
      },
      fontSize: {
        // Apple HIG type scale
        display: ['1.75rem', { lineHeight: '1.2', fontWeight: '700' }],       // 28px
        'title-1': ['1.375rem', { lineHeight: '1.3', fontWeight: '600' }],    // 22px
        'title-2': ['1.0625rem', { lineHeight: '1.35', fontWeight: '600' }],  // 17px
        body: ['0.9375rem', { lineHeight: '1.5', fontWeight: '400' }],        // 15px
        callout: ['0.8125rem', { lineHeight: '1.4', fontWeight: '400' }],     // 13px
        caption: ['0.6875rem', { lineHeight: '1.3', fontWeight: '400' }],     // 11px
      },
      animation: {
        'pulse-border': 'pulse-border 1400ms ease-in-out infinite',
        shimmer: 'shimmer 1.5s ease-in-out infinite',
        'pulse-fill': 'pulse-fill 1400ms ease-in-out infinite',
        'slide-up': 'slide-up 300ms ease-out',
        'slide-in-right': 'slide-in-right 250ms ease-out',
      },
      keyframes: {
        'pulse-border': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-fill': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      screens: {
        xs: '375px',
        sm: '390px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1440px',
      },
    },
  },
  plugins: [],
};

export default config;
