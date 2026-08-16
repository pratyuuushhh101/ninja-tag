export class WebSocketClient {
  constructor() {
    this.ws = null;
    this.onMessageHandler = null;
    this.onCloseHandler = null;
    this.onErrorHandler = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        resolve();
        return;
      }

      const wsUrl = url || import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        resolve();
      };

      this.ws.onmessage = (event) => {
        if (this.onMessageHandler) {
          try {
            const data = JSON.parse(event.data);
            this.onMessageHandler(data);
          } catch (e) {
            console.error('Failed to parse WS message', e);
          }
        }
      };

      this.ws.onclose = () => {
        if (this.onCloseHandler) this.onCloseHandler();
      };

      this.ws.onerror = (error) => {
        if (this.onErrorHandler) this.onErrorHandler(error);
        reject(error);
      };
    });
  }

  send(message) {
    if (this.isConnected()) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(handler) {
    this.onMessageHandler = handler;
  }

  onClose(handler) {
    this.onCloseHandler = handler;
  }

  onError(handler) {
    this.onErrorHandler = handler;
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
