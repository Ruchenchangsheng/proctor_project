// useCatalogTranslation 封装面向业务文案目录的翻译钩子，减少页面里重复的键名处理。
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { normalizeLanguage, toIntlLocale, translateSourceText } from "./catalog";

export default function useCatalogTranslation() {
  const { t, i18n } = useTranslation();
  const language = normalizeLanguage(i18n.language);

  const tr = useCallback((text) => {
    if (typeof text !== "string") return text;
    return translateSourceText(text, language);
  }, [language]);

  return {
    t,
    i18n,
    language,
    locale: toIntlLocale(language),
    tr,
  };
}
