import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "co.please.tourstar",
  appName: "TourStar",
  webDir: "dist",
  backgroundColor: "#070a1a",
  ios: {
    contentInset: "never",
    backgroundColor: "#070a1a",
  },
  android: {
    backgroundColor: "#070a1a",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // hidden from the app once the save has loaded
      backgroundColor: "#070a1a",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#070a1a",
    },
  },
};

export default config;
