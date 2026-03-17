// stomp 模块统一创建带鉴权头的 STOMP 客户端，供学生端和教师端复用同一实时通信配置。
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuthStore } from "./store/auth";

export function createStomp() {
  const token = useAuthStore.getState().token;
  const sockJsUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8080/ws`
    : undefined;

  return new Client({
    // 这里直接连后端 8080，是为了让实时链路独立于 Vite 代理和页面当前端口。
    // 固定走后端 SockJS 直连，避免开发代理与原生 ws 端点差异造成握手失败。
    webSocketFactory: () => {
      const endpoint = sockJsUrl || "http://localhost:8080/ws";
      console.info("[stomp] create SockJS client", { endpoint });
      return new SockJS(endpoint, undefined, {
        transports: ["websocket", "xhr-streaming", "xhr-polling"],
      });
    },
    connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: (line) => console.info("[stomp]", line),
  });
}
