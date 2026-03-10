//Stomp.js
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useAuthStore } from "./store/auth";

export function createStomp() {
  const token = useAuthStore.getState().token;

  // 使用 SockJS 握手（后端若是原生 ws，可改为 brokerURL 直连）
const client = new Client({
     // 走相对路径，由 Vite 代理到 8080
     webSocketFactory: () => new SockJS("/ws"),
     // 如果后端是原生 ws 而不是 SockJS，用这一行替换上面那行：
     // brokerURL: (location.origin.replace(/^http/, "ws")) + "/ws",
     connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
     reconnectDelay: 5000,
     debug: () => {}
   });
   return client;
}
