import { EventEmitter } from 'events';
import { toast } from '../components/Toast';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

type MediaAttachment = {
  url: string;
  type: 'image' | 'video' | 'audio';
  duration?: number;
  width?: number;
  height?: number;
};

type ChatMessage = {
  id: string;
  user: string;
  text: string;
  createdAt: number;
  type: 'user' | 'system';
  media?: MediaAttachment;
};

class WebSocketClient extends EventEmitter {
  private socket: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  public status: ConnectionStatus = 'disconnected';

  constructor(url: string) {
    super();
    this.url = url;
  }

  connect() {
    if (this.socket || this.status === 'connected') return;

    this.status = 'connecting';
    this.emit('status', this.status);

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.status = 'connected';
        this.reconnectAttempts = 0;
        this.emit('status', this.status);
        this.startHeartbeat();
        console.log('WS Connected');
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          // Only log in development and reduce noise
          if (__DEV__) {
            console.debug('WS message parse error:', e instanceof Error ? e.message : 'Unknown error');
          }
        }
      };

      this.socket.onclose = () => {
        this.cleanup();
        this.status = 'disconnected';
        this.emit('status', this.status);
        this.attemptReconnect();
      };

      this.socket.onerror = (error) => {
        // Only log detailed errors in development
        if (__DEV__) {
          console.error('WS Error:', error);
        }
        // Error will trigger close, which handles reconnect
      };

    } catch (e) {
      if (__DEV__) {
        console.error('WS Connection Failed:', e);
      }
      this.attemptReconnect();
    }
  }

  disconnect() {
    this.cleanup();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.status = 'disconnected';
    this.emit('status', this.status);
  }

  sendMessage(message: Partial<ChatMessage>) {
    if (this.status !== 'connected' || !this.socket) {
      if (__DEV__) {
        console.debug('Cannot send message: Not connected');
      }
      toast.error('Message failed to send. Check your connection.');
      // Queue message logic could go here
      return false;
    }

    try {
      this.socket.send(JSON.stringify({ type: 'message', payload: message }));
      return true;
    } catch (e) {
      if (__DEV__) {
        console.error('Send failed:', e);
      }
      toast.error('Failed to send message. Please try again.');
      return false;
    }
  }

  private handleMessage(data: Record<string, unknown>) {
    switch (data.type) {
      case 'message':
        this.emit('message', data.payload);
        break;
      case 'presence':
        // Handle presence updates if we decide to re-enable them later
        break;
      case 'pong':
        // Heartbeat response
        break;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.status = 'reconnecting';
    this.emit('status', this.status);

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private cleanup() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Export singleton instance or factory
export const chatClient = new WebSocketClient('wss://api.vulugo.com/chat');
