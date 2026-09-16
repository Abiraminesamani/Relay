/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#08090A",
          sidebar: "#0C0D0F",
          card: "#111214",
          cardHover: "#17181B",
          border: "#24262A",
          primary: "#F5F5F5",
          secondary: "#8B8F98",
          muted: "#5C6068",
        },
        relay: {
          indigo: "#6366F1",
          hover: "#4F46E5",
          subtle: "rgba(99, 102, 241, 0.12)",
          border: "rgba(99, 102, 241, 0.25)",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          error: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};
