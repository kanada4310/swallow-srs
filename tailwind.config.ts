import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ブランド（つばめの羽色）: 藍=見出し/濃い地、空=アクション、橙=CTA/ストリーク/祝い
        ai: {
          DEFAULT: "#1C2B4B",
          deep: "#131E36",
          soft: "#27407A",
        },
        sora: {
          DEFAULT: "#3E8EF7",
          dark: "#2D74D6",
          soft: "#E8F1FE",
        },
        nodo: {
          DEFAULT: "#FF7849",
          dark: "#F05E2E",
          soft: "#FFEFE7",
        },
        // SRS評価4色（淡い地色 bg ×濃い文字 DEFAULT）
        again: { DEFAULT: "#E5484D", bg: "#FDEBEC" },
        hard: { DEFAULT: "#D97706", bg: "#FCF0DE" },
        good: { DEFAULT: "#17925F", dark: "#127A4F", bg: "#E4F5EC" },
        easy: { DEFAULT: "#3E8EF7", bg: "#E8F1FE" },
      },
      borderRadius: {
        card: "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,43,75,.05), 0 8px 24px rgba(28,43,75,.08)",
      },
    },
  },
  plugins: [],
};
export default config;
