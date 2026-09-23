import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "engineer.badry.karyawan",
  appName: "Karyawan",
  webDir: "www",
  server: {
    url: "https://karyawan.badry.engineer",
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#125fb3",
  },
};

export default config;
