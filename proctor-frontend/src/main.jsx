import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ConfigProvider } from "antd";

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <ConfigProvider
      theme={{
        token: {
          // 将所有组件的默认背景改为半透明白色
          colorBgContainer: 'rgba(255, 255, 255, 0.5)', 
          // 悬浮层（如弹窗、下拉菜单）的背景
          colorBgElevated: 'rgba(255, 255, 255, 0.6)',  
          // 整体布局的背景改为透明，以便透出 body 的渐变色
          colorBgLayout: 'transparent', 
          // 边框设为半透明
          colorBorderSecondary: 'rgba(255, 255, 255, 0.3)', 
        },
        components: {
          Layout: {
            headerBg: 'rgba(255, 255, 255, 0.3)', // 顶部导航半透明
            siderBg: 'rgba(255, 255, 255, 0.4)',  // 侧边栏半透明
          },
          Card: {
            colorBgContainer: 'rgba(255, 255, 255, 0.4)', // 卡片更透明一些
          }
        }
      }}
    >
      <App/>
    </ConfigProvider>
  </BrowserRouter>
);
