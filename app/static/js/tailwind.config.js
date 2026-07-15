tailwind = {
  config: {
    theme: {
      screens: {
        xs: "400px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
      extend: {
        spacing: {
          "0.5": "0.125rem",  //  2px
          "1.5": "0.375rem",  //  6px
          "2.5": "0.625rem",  // 10px
          "3.5": "0.875rem",  // 14px
          "4.5": "1.125rem",  // 18px
        },
        fontFamily: {
          heading: ["Orbitron", "system-ui", "sans-serif"],
          body: ["JetBrains Mono", "monospace"],
          mono: ["JetBrains Mono", "monospace"],
        },
        colors: {
          white: "#FAFAF8",
          zinc: {
            50: "#FAFAF8",
            100: "#F3F3F0",
            200: "#E6E6E1",
            300: "#D3D3CB",
            400: "#9C9C94",
            500: "#7A7A7A",
            600: "#606060",
            700: "#4D4D4D",
            800: "#333333",
            900: "#1A1A1A",
          },
          sage: {
            DEFAULT: "#24cfff",
            50: "#F3F7F2",
            100: "#E8EFE5",
            200: "#D1E0CC",
            300: "#BAD1B3",
            400: "#A2C39A",
            500: "#9CAF88",
            600: "#7E9370",
            700: "#607055",
            800: "#414C3A",
            900: "#21261D",
          },
          emerald: {
            500: "#59f0b1",
          }
        },
      },
    },
  }
};
