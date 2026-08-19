import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F7F1E3",
        paperD: "#EFE5CF",
        cream: "#FDF9EC",
        ink: "#41382C",
        inkSoft: "#7d7160",
        inkFaint: "#a3937c",
        accent: "#C0533E",
        tape: "#F2D06B",
        leaf: "#6F8F6A",
        sky: "#7590A8",
        wood: "#8B6F52",
        ruled: "#D8CBB2",
      },
      fontFamily: {
        hand: ["Caveat", "cursive"],
        body: ["Kalam", "'Comic Sans MS'", "cursive"],
      },
      boxShadow: {
        sketch: "3px 3px 0 #41382C",
        sketchSoft: "3px 3px 0 rgba(65,56,44,.2)",
        polaroid: "0 5px 14px rgba(65,56,44,.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
