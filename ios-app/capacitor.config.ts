import type { CapacitorConfig } from "@capacitor/cli";

/**
 * D&N для iPhone. Приложение открывает тот же D&N, что и сайт (данные — на сервере),
 * и добавляет то, чего нет в браузере: вход по Face ID, работа на весь экран, иконка и заставка.
 *
 * Адрес сервера и идентификатор приложения меняются здесь.
 */
const config: CapacitorConfig = {
  appId: "com.dnmoney.app",
  appName: "D&N",
  webDir: "www",
  server: {
    url: process.env.DN_APP_URL || "https://dn-digx.onrender.com",
    // Внутри приложения переходы по ссылкам D&N остаются в приложении.
    allowNavigation: ["dn-digx.onrender.com"],
    errorPath: "index.html",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0d0d12",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#0d0d12", showSpinner: false },
    StatusBar: { overlaysWebView: true, style: "DEFAULT" },
  },
};

export default config;
