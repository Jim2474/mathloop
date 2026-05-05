import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d2733",
        paper: "#f8f4ec",
        line: "#d8cfc0",
        moss: "#426857",
        cinnabar: "#b85042",
        slateblue: "#415a77",
      },
      boxShadow: {
        soft: "0 18px 45px rgba(66, 56, 42, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
