import type { Config } from "tailwindcss";

const tailwindEmailConfig: Config = {
  content: [],
  theme: {
    extend: {
      colors: {
        gray: {
          500: "#747474",
          200: "#E5E5E5",
        },
        mint: "#4FD9C4",
      },
      fontSize: {
        sm: "14px",
        lg: "32px",
      },
    },
  },
  plugins: [], // ❗ NO plugins
};

export default tailwindEmailConfig;
