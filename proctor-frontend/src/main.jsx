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
