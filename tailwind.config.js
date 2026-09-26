module.exports = {
  content: ["./src/**/*.{html,js,njk,md}"],
  theme: {
    extend: {
      colors: {
        cream: "#F6F2E9",
        warmgray: "#262320",
        accent: "#1D6B50",
        "accent-light": "#2F8563",
        "warm-border": "#E3DCCD",
      },
      fontFamily: {
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      transitionDuration: {
        3000: "3000ms",
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
