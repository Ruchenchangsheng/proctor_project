// LanguageSwitcher 提供中英文切换入口，让页面可以按当前语言刷新文案。
import { GlobalOutlined } from "@ant-design/icons";
import { Select } from "antd";
import { useTranslation } from "react-i18next";
import { normalizeLanguage } from "../i18n/catalog";

const options = [
  { value: "zh-CN", labelKey: "app.language.zh", shortKey: "app.language.zh.short" },
  { value: "en-US", labelKey: "app.language.en", shortKey: "app.language.en.short" },
  { value: "ru-RU", labelKey: "app.language.ru", shortKey: "app.language.ru.short" },
];

export default function LanguageSwitcher({ compact = false, className = "" }) {
  const { t, i18n } = useTranslation();
  const value = normalizeLanguage(i18n.language);
  const rootClassName = ["app-language-switcher", compact ? "is-compact" : "", className].filter(Boolean).join(" ");

  return (
    <div className={rootClassName} data-i18n-skip="true">
      {!compact && (
        <div className="app-language-switcher-title">
          <GlobalOutlined />
          <span>{t("app.language.label")}</span>
        </div>
      )}
      <Select
        className="app-language-switcher-select"
        value={value}
        suffixIcon={<GlobalOutlined />}
        options={options.map((option) => ({
          value: option.value,
          label: `${t(option.shortKey)} · ${t(option.labelKey)}`,
        }))}
        onChange={(nextLanguage) => i18n.changeLanguage(nextLanguage)}
        popupMatchSelectWidth={false}
      />
    </div>
  );
}
