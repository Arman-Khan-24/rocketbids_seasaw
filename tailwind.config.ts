import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "rocket-gold": "#f0a500",
        "rocket-teal": "#00c9a7",
        "rocket-danger": "#ff3d5a",
        "rocket-bg": "rgb(var(--bg-rgb) / <alpha-value>)",
        "rocket-card": "rgb(var(--card-rgb) / <alpha-value>)",
        "rocket-border": "rgb(var(--border-rgb) / <alpha-value>)",
        "rocket-text": "rgb(var(--text-rgb) / <alpha-value>)",
        "rocket-muted": "rgb(var(--muted-rgb) / <alpha-value>)",
        "rocket-dim": "rgb(var(--dim-rgb) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Georgia", "serif"],
        mono: ['"Courier New"', "monospace"],
      },
      keyframes: {
        "pulse-war": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(255, 61, 90, 0.4)" },
          "50%": { boxShadow: "0 0 20px 10px rgba(255, 61, 90, 0.2)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-war": "pulse-war 1s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
