import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d1d1f",
        paper: "#f5f5f7",
        line: "#d2d2d7",
        moss: "#0066cc",
        cinnabar: "#ff3b30",
        slateblue: "#0066cc",
      },
      boxShadow: {
        soft: "0 18px 55px rgba(0, 0, 0, 0.08)",
        float: "0 28px 90px rgba(0, 0, 0, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
