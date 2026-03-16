//Stomp.js
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuthStore } from "./store/auth";

export function createStomp() {
  const token = useAuthStore.getState().token;
  const sockJsUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8080/ws`
    : undefined;

  return new Client({
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
