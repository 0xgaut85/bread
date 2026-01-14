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
        background: "#0D0D0F",
        foreground: "#FFFFFF",
        primary: "#02FF40",
        surface: {
          DEFAULT: "#1A1A1C",
          light: "#262629",
          dark: "#0D0D0F",
        },
        muted: {
          DEFAULT: "#6b6b6b",
          light: "#9a9a9a",
          dark: "#4a4a4a",
        },
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.1)",
          light: "rgba(255, 255, 255, 0.15)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "ticker-scroll": "ticker-scroll 40s linear infinite",
      },
      keyframes: {
        "ticker-scroll": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};
