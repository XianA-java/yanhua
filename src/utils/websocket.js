export class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url
    this.options = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      ...options
    }
    this.reconnectAttempts = 0
    this.handlers = new Map()
    this.connect()
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url)
      this.bindEvents()
    } catch (error) {
      this.handleError(error)
    }
  }

  bindEvents() {
    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.emit('connected')
    }

    this.ws.onclose = () => {
      this.emit('disconnected')
      this.reconnect()
    }

    this.ws.onerror = (error) => {
      this.handleError(error)
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit('message', data)
      } catch (error) {
        console.error('Failed to parse message:', error)
      }
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => this.connect(), this.options.reconnectInterval)
    } else {
      this.emit('maxReconnectAttemptsReached')
    }
  }

  handleError(error) {
    console.error('WebSocket error:', error)
    this.emit('error', error)
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event).add(handler)
  }

  emit(event, data) {
    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(data))
    }
  }

  close() {
    if (this.ws) {
      this.ws.close()
    }
  }
} 