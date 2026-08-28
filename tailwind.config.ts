import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        // theme-aware re-mapping - see the comment at the top of globals.css
        white: "rgb(var(--tint) / <alpha-value>)",
        black: "rgb(var(--shade) / <alpha-value>)",
        pure: "rgb(var(--pure) / <alpha-value>)",
        canvas: "rgb(var(--canvas) / <alpha-value>)",

        /*
          The user-chosen accent. Every control that used to hardcode
          `violet-400` now uses `accentc`, so the Appearance picker actually
          repaints the app instead of only tinting the ambient glow.
          `accentc-vivid` stays bright in both themes - for glows and fills
          where a darkened ink tone would look muddy.
        */
        accentc: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          2: "rgb(var(--accent-2-rgb) / <alpha-value>)",
          vivid: "rgb(var(--accent-vivid-rgb) / <alpha-value>)",
        },

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        accent: "0 0 0 1px rgb(var(--accent-rgb) / 0.25), 0 8px 32px -12px rgb(var(--accent-vivid-rgb) / 0.5)",
        lift: "0 1px 2px rgb(0 0 0 / 0.06), 0 12px 32px -16px rgb(0 0 0 / 0.4)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        ripple: {
          "0%": { transform: "scale(0.5)", opacity: "0.6" },
          "100%": { transform: "scale(2)", opacity: "0" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        ripple: "ripple 0.9s ease-out",
        "slide-up": "slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
