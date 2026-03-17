// I18nAppProvider 负责在应用根部注入国际化上下文，让页面可以直接读取翻译能力。
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

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
  useEffect(() => {
    const handleChange = (nextLanguage) => setLanguage(normalizeLanguage(nextLanguage));
    i18n.on("languageChanged", handleChange);
    return () => i18n.off("languageChanged", handleChange);
  }, []);

  // 这个 effect 负责在依赖变化时同步加载数据或建立/释放副作用。
  // 阅读时可以重点看依赖数组、内部异步流程以及 return 清理逻辑三部分。
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
