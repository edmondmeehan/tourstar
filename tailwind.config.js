/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--background)",
        fg: "var(--foreground)",
        card: "var(--card)",
        muted: "var(--muted)",
        "muted-fg": "var(--muted-foreground)",
        line: "var(--border)",
        primary: "var(--primary)",
        accent: "var(--accent)",
        pink: "var(--neon-pink)",
        electric: "var(--electric)",
        gold: "var(--gold)",
        navy: "var(--navy)",
        success: "var(--success)",
        danger: "var(--danger)",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        logo: ['"Permanent Marker"', "cursive"],
      },
      borderRadius: { xl: "0.75rem" },
    },
  },
  plugins: [],
};
