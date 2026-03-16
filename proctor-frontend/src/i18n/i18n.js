import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LANGUAGE, detectInitialLanguage, LANGUAGE_STORAGE_KEY, normalizeLanguage, resources, SUPPORTED_LANGUAGES } from "./catalog";

const initialLanguage = detectInitialLanguage();

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
  react: {
    useSuspense: false,
  },
});

const syncLanguage = (nextLanguage) => {
  const normalized = normalizeLanguage(nextLanguage);
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalized;
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  }
};

syncLanguage(i18n.language);
i18n.on("languageChanged", syncLanguage);

export default i18n;
