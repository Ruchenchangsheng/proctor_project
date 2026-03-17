// i18n 负责初始化国际化实例，统一注册语言包、默认语言和浏览器侧同步逻辑。
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

// 负责把页面中的一段独立交互逻辑拆出来，避免主组件渲染区混入过多细节。
// 跟读这个函数时，建议同时留意它依赖了哪些 state/ref，以及执行后会触发哪些界面刷新。
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
