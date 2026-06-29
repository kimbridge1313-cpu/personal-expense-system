/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        appBg: "#f6f3ec",
        appSurface: "#fffdf8",
        appLine: "#e4dacc",
        appText: "#25231f",
        appMuted: "#7a7368"
      }
    }
  },
  plugins: []
};
