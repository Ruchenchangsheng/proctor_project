// main 负责挂载 React 应用，并把路由、国际化和全局样式注入到浏览器入口。
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import I18nAppProvider from "./i18n/I18nAppProvider.jsx";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <I18nAppProvider>
      <App />
    </I18nAppProvider>
  </BrowserRouter>
);
