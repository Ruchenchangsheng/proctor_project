import { useEffect, useState } from "react";
import { ConfigProvider } from "antd";
import enUS from "antd/locale/en_US";
import ruRU from "antd/locale/ru_RU";
import zhCN from "antd/locale/zh_CN";
import { I18nextProvider } from "react-i18next";
import DomTranslator from "./DomTranslator.jsx";
import i18n from "./i18n";
import { normalizeLanguage } from "./catalog";

const antdLocaleMap = {
  "zh-CN": zhCN,
  "en-US": enUS,
  "ru-RU": ruRU,
};

const theme = {
  token: {
    colorBgContainer: "rgba(255, 255, 255, 0.5)",
    colorBgElevated: "rgba(255, 255, 255, 0.6)",
    colorBgLayout: "transparent",
    colorBorderSecondary: "rgba(255, 255, 255, 0.3)",
  },
  components: {
    Layout: {
      headerBg: "rgba(255, 255, 255, 0.3)",
      siderBg: "rgba(255, 255, 255, 0.4)",
    },
    Card: {
      colorBgContainer: "rgba(255, 255, 255, 0.4)",
    },
  },
};

export default function I18nAppProvider({ children }) {
  const [language, setLanguage] = useState(normalizeLanguage(i18n.language));

  useEffect(() => {
    const handleChange = (nextLanguage) => setLanguage(normalizeLanguage(nextLanguage));
    i18n.on("languageChanged", handleChange);
    return () => i18n.off("languageChanged", handleChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.body?.setAttribute("lang", language);
  }, [language]);

  return (
    <I18nextProvider i18n={i18n}>
      <ConfigProvider locale={antdLocaleMap[language] || zhCN} theme={theme}>
        {children}
        <DomTranslator />
      </ConfigProvider>
    </I18nextProvider>
  );
}
