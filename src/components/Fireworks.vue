<template>
  <div class="fireworks-container"
       @touchstart="handleTouchStart"
       @touchmove="handleTouchMove"
       @touchend="handleTouchEnd"
       @gesturestart="handleGestureStart"
       @gesturechange="handleGestureChange"
       @gestureend="handleGestureEnd">
    <audio id="launchSound" src="/sounds/launch.mp3" preload="auto"></audio>
    <audio id="explosionSound" src="/sounds/explosion.mp3" preload="auto"></audio>

    <canvas ref="bgCanvas" :width="width" :height="height"></canvas>
    <canvas ref="canvas" :width="width" :height="height"></canvas>
    
    <!-- 添加输入框和发射按钮的容器 -->
    <div class="text-input-container" v-if="showTextInput">
      <input 
        type="text" 
        v-model="customText" 
        placeholder="输入烟花文字"
        maxlength="8"
        class="text-input"
        @keyup.enter="launchCustomText"
      >
      <button @click="launchCustomText" class="launch-btn">发射</button>
      <button @click="closeTextInput" class="launch-btn close-btn">×</button>
    </div>

    <!-- 添加浮动控制按钮 -->
    <div class="control-button" @click="toggleControlPanel">
      <span class="control-icon">{{ isControlPanelOpen ? '×' : '☰' }}</span>
    </div>

    <!-- 桌面端按钮 -->
    <div class="desktop-buttons">
      <button @click="initAudio" class="launch-btn sound-btn" v-if="!isAudioInitialized">
        点击启用音效
      </button>
      <button @click="toggleSound" class="launch-btn sound-btn" v-else>
        {{ isSoundEnabled ? '🔊 音效开启' : '🔈 音效关闭' }}
      </button>
      <button @click="toggleColorMode" class="launch-btn">
        {{ isMultiColor ? '🌈 炫彩模式' : '🎨 单色模式' }}
      </button>
      <button @click="addFirework('normal')" class="launch-btn">普通烟花</button>
      <button @click="addFirework('circle')" class="launch-btn">环形烟花</button>
      <button @click="addFirework('heart')" class="launch-btn">心形烟花</button>
      <button @click="addFirework('spiral')" class="launch-btn">螺旋烟花</button>
      <button @click="openTextInput" class="launch-btn">自定义文字</button>
    </div>

    <!-- 修改移动端控制面板 -->
    <transition name="slide-up">
      <div class="mobile-control-panel" v-show="isControlPanelOpen">
        <div class="panel-header">
          <div class="handle-bar"></div>
        </div>
        <div class="button-grid">
          <button @click="initAudio" class="launch-btn sound-btn" v-if="!isAudioInitialized">
            点击启用音效
          </button>
          <button @click="toggleSound" class="launch-btn sound-btn" v-else>
            {{ isSoundEnabled ? '🔊 音效开启' : '🔈 音效关闭' }}
          </button>
          <button @click="toggleColorMode" class="launch-btn">
            {{ isMultiColor ? '🌈 炫彩模式' : '🎨 单色模式' }}
          </button>
          <button @click="addFirework('normal')" class="launch-btn">普通烟花</button>
          <button @click="addFirework('circle')" class="launch-btn">环形烟花</button>
          <button @click="addFirework('heart')" class="launch-btn">心形烟花</button>
          <button @click="addFirework('spiral')" class="launch-btn">螺旋烟花</button>
          <button @click="openTextInput" class="launch-btn">自定义文字</button>
        </div>
      </div>
    </transition>

    <!-- 添加触摸提示 -->
    <div class="touch-hint" v-if="showTouchHint">
      点击屏幕任意位置发射烟花
    </div>

    <!-- 添加连接状态指示器 -->
    <div class="connection-status" :class="{ connected: isConnected }">
      {{ isConnected ? '🟢 已连接' : '🔴 未连接' }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvas = ref(null)
const bgCanvas = ref(null)
let width = window.innerWidth
let height = window.innerHeight
let ctx = null
let bgCtx = null
let particles = []
let rockets = []
let stars = []
let meteors = []
let animationId = null
const isSoundEnabled = ref(false)
const isAudioInitialized = ref(false)

// 添加新的响应式变量
const showTextInput = ref(false)
const customText = ref('')

// 添加颜色模式控制
const isMultiColor = ref(false)

// WebSocket 连接
const ws = ref(null)
const isConnected = ref(false)

// 在 script setup 部分添加粒子池管理
const PARTICLE_POOL_SIZE = 4000
const particlePool = []

// 添加控制面板状态
const isControlPanelOpen = ref(false)

// 添加控制面板切换函数
const toggleControlPanel = () => {
  isControlPanelOpen.value = !isControlPanelOpen.value
}

// 在窗口大小变化时更新画布大小
const handleResize = () => {
  // 更新宽高变量
  width = window.innerWidth
  height = window.innerHeight

  // 更新画布尺寸
  canvas.value.width = window.innerWidth
  canvas.value.height = window.innerHeight
  bgCanvas.value.width = window.innerWidth
  bgCanvas.value.height = window.innerHeight

  // 重新初始化背景
  if (bgCtx) {
    bgCtx.fillStyle = 'black'
    bgCtx.fillRect(0, 0, width, height)
  }

  // 更新所有星星的位置
  stars.forEach(star => {
    if (star.x > width || star.y > height) {
      star.reset()
    }
  })

  // 更新所有流星的位置
  meteors.forEach(meteor => {
    if (meteor.x > width || meteor.y > height) {
      meteor.reset()
    }
  })
}

// 添加防抖处理
let resizeTimeout
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout)
  resizeTimeout = setTimeout(handleResize, 100)
})

// 连接 WebSocket
function connectWebSocket() {
  // 使用 Render 提供的 WSS 地址
  const wsUrl = `wss://fireworks-server.onrender.com/`
  
  try {
    ws.value = new WebSocket(wsUrl)
    
    ws.value.onopen = () => {
      console.log('Connected to WebSocket server')
      isConnected.value = true
    }
    
    ws.value.onerror = (error) => {
      console.error('WebSocket error:', error)
      isConnected.value = false
    }
    
    ws.value.onclose = () => {
      console.log('Disconnected from server')
      isConnected.value = false
      // 尝试重新连接
      setTimeout(connectWebSocket, 3000)
    }
    
    ws.value.onmessage = (event) => {
      let messageData;

      // 检查消息类型
      if (typeof event.data === 'string') {
        messageData = event.data; // 直接使用字符串
      } else if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = function() {
          messageData = reader.result; // 读取 Blob 内容
          handleMessage(messageData); // 处理消息
        };
        reader.readAsText(event.data); // 将 Blob 转换为文本
        return; // 退出函数，等待读取完成
      }

      // 处理消息
      handleMessage(messageData);
    }
  } catch (error) {
    console.error('WebSocket connection error:', error)
    isConnected.value = false
    // 尝试重新连接
    setTimeout(connectWebSocket, 3000)
  }
}

// 处理消息的函数
function handleMessage(data) {
  try {
    const parsedData = JSON.parse(data);
    handleRemoteFirework(parsedData);
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
    console.log('Received message:', data); // 输出原始消息以便调试
    // 处理连接确认消息
    if (data.startsWith("Connected")) {
      console.log(data); // 处理连接确认消息
      isConnected.value = true; // 设置连接状态为 true
    }
  }
}

// 处理远程烟花事件
function handleRemoteFirework(data) {
  if (data.type === 'firework') {
    const { x, y, fireworkType, text, isMultiColorMode } = data
    // 临时保存当前的炫彩模式
    const currentMode = isMultiColor.value
    // 设置为接收到的模式
    isMultiColor.value = isMultiColorMode
    // 创建烟花
    createFirework(x, y, fireworkType, text)
    // 恢复原来的模式
    isMultiColor.value = currentMode
  }
}

// 添加颜色模式切换函数
const toggleColorMode = () => {
  isMultiColor.value = !isMultiColor.value
}

// 添加随机颜色生成函数
const getRandomColor = () => {
  const colors = [
    '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff',
    '#00ffff', '#ffa500', '#ff1493', '#7fff00', '#ff69b4',
    '#9400d3', '#40e0d0', '#ff6b6b', '#4ecdc4'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// 添加新的方法
const openTextInput = () => {
  showTextInput.value = true
}

const closeTextInput = () => {
  showTextInput.value = false
  customText.value = ''
}

const launchCustomText = () => {
  if (customText.value.trim()) {
    addFirework('text', customText.value)
    closeTextInput()
  }
}

// 播放音效
const playSound = (soundId, volume = 0.5) => {
  if (!isSoundEnabled.value) return
  
  const sound = document.getElementById(soundId)
  if (sound) {
    // 克隆节点以实现多重播放
    const clone = sound.cloneNode()
    clone.volume = volume
    clone.play().catch(err => console.log('播放失败:', err))
    
    // 播放完成后删除克隆的节点
    clone.onended = () => clone.remove()
  }
}

// 初始化音频
const initAudio = async () => {
  try {
    const launchSound = document.getElementById('launchSound')
    const explosionSound = document.getElementById('explosionSound')
    
    // 尝试播放并立即暂停来解锁音频
    await Promise.all([
      launchSound.play().then(() => launchSound.pause()),
      explosionSound.play().then(() => explosionSound.pause())
    ])

    isAudioInitialized.value = true
    isSoundEnabled.value = true
    console.log('音频初始化成功')
  } catch (error) {
    console.error('音频初始化失败:', error)
  }
}

// 音效开关
const toggleSound = () => {
  isSoundEnabled.value = !isSoundEnabled.value
  console.log('音效状态:', isSoundEnabled.value ? '开启' : '关闭')
}

// 火箭类
class Rocket {
  constructor(x, y, targetX, targetY, color, type = 'normal', text = '') {
    this.x = x
    this.y = y
    this.targetX = targetX
    this.targetY = targetY
    this.color = color
    this.type = type
    this.text = text
    this.speed = 15
    this.angle = Math.atan2(targetY - y, targetX - x)
    this.trail = []
  }

  draw() {
    ctx.beginPath()
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2)
    ctx.fillStyle = this.color
    ctx.fill()

    // 绘制尾迹
    for (let i = 0; i < this.trail.length; i++) {
      const point = this.trail[i]
      ctx.beginPath()
      ctx.arc(point.x, point.y, 1, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${i / this.trail.length})`
      ctx.fill()
    }
  }

  update() {
    this.trail.push({ x: this.x, y: this.y })
    if (this.trail.length > 10) this.trail.shift()

    this.x += Math.cos(this.angle) * this.speed
    this.y += Math.sin(this.angle) * this.speed

    const distance = Math.hypot(this.targetX - this.x, this.targetY - this.y)
    return distance < 15
  }
}

// 增强的粒子类
class Particle {
  constructor(x, y, color, type = 'normal', angle = null, textPosition = null) {
    this.init(x, y, color, type, angle, textPosition)
  }

  init(x, y, color, type = 'normal', angle = null, textPosition = null) {
    this.x = x
    this.y = y
    this.color = color
    this.size = Math.random() * 2 + 1.5
    this.alpha = 1
    this.type = type
    this.active = true // 添加活跃状态标记
    this.lifetime = 0  // 添加生命周期计数器
    this.maxLifetime = type === 'text' ? 300 : 200 // 延长粒子的生命周期
    
    const baseSpeed = type === 'normal' ? 12 : 6
    const spread = type === 'normal' ? 1 : 0.5
    
    // 简化闪烁效果
    this.sparkle = Math.random() > 0.7
    this.sparkleSpeed = 0.03 + Math.random() * 0.03
    
    // 简化尾迹
    this.trail = []
    this.maxTrailLength = 3  // 减少尾迹长度
    
    if (type === 'normal') {
      const randomAngle = Math.random() * Math.PI * 2
      this.vx = Math.cos(randomAngle) * baseSpeed * Math.random()
      this.vy = Math.sin(randomAngle) * baseSpeed * Math.random()
    } else if (type === 'circle') {
      const speed = baseSpeed * (0.8 + Math.random() * 0.4)
      this.vx = Math.cos(angle) * speed * spread
      this.vy = Math.sin(angle) * speed * spread
    } else if (type === 'heart') {
      const scale = 6
      const heartX = 16 * Math.pow(Math.sin(angle), 3)
      const heartY = -(13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle))
      
      this.x = x + heartX * scale
      this.y = y + heartY * scale
      
      const directionX = this.x - x
      const directionY = this.y - y
      const length = Math.sqrt(directionX * directionX + directionY * directionY) || 1  // 防止除以0
      this.vx = (directionX / length) * baseSpeed * spread * 0.5
      this.vy = (directionY / length) * baseSpeed * spread * 0.5
    } else if (type === 'spiral') {
      const radius = angle * 1.5
      const spiralX = Math.cos(angle) * radius
      const spiralY = Math.sin(angle) * radius
      
      this.x = x + spiralX * 2
      this.y = y + spiralY * 2
      
      const directionX = this.x - x
      const directionY = this.y - y
      const length = Math.sqrt(directionX * directionX + directionY * directionY) || 1
      this.vx = (directionX / length) * baseSpeed * spread * 0.7
      this.vy = (directionY / length) * baseSpeed * spread * 0.7
    } else if (type === 'text' && textPosition) {
      // 文字形状：使用预计算的位置
      this.x = x + textPosition.x
      this.y = y + textPosition.y
      
      // 减小文字粒子的初始速度
      const directionX = this.x - x
      const directionY = this.y - y
      const length = Math.sqrt(directionX * directionX + directionY * directionY) || 1
      this.vx = (directionX / length) * baseSpeed * spread * 0.2  // 减小速度
      this.vy = (directionY / length) * baseSpeed * spread * 0.2
      
      // 文字粒子特殊属性
      this.isText = true
      this.originalX = this.x  // 记录原始位置
      this.originalY = this.y
      this.fadeDelay = 50     // 延迟消失
      this.fadeCounter = 0    // 计数器
      this.alphaDecay = 0.003 // 进一步减慢消失速度
    } else {
      // 非文字粒子的衰减速度
      this.alphaDecay = 0.005
    }
    
    // 减小随机偏移
    this.vx += (Math.random() - 0.5)
    this.vy += (Math.random() - 0.5)

    // 添加颜色过渡效果
    if (isMultiColor.value) {
      this.nextColor = getRandomColor()
      this.colorTransition = 0
      this.colorTransitionSpeed = 0.02 + Math.random() * 0.02
    }
  }

  update() {
    // 只有当粒子完全离开屏幕时才标记为非活跃
    if (this.y > height + 50) {
      this.active = false
      return false
    }

    // 更新尾迹
    if (this.trail.length < this.maxTrailLength) {
      this.trail.push({ x: this.x, y: this.y, alpha: this.alpha })
    } else {
      this.trail.shift()
      this.trail.push({ x: this.x, y: this.y, alpha: this.alpha })
    }
    
    // 文字粒子的特殊更新逻辑
    if (this.isText) {
      if (this.fadeCounter < this.fadeDelay) {
        // 延迟期间，粒子会轻微摆动
        this.fadeCounter++
        const wobble = Math.sin(Date.now() * 0.01) * 0.5
        this.x = this.originalX + wobble
        this.y = this.originalY + wobble
        
        // 保持完全不透明
        this.alpha = 1
      } else {
        // 调整文字粒子的移动和消失
        this.x += this.vx * 0.5
        this.y += this.vy * 0.5
        this.vy += 0.03  // 进一步减小重力效果
        this.vx *= 0.99
        this.vy *= 0.99
        this.alpha -= this.alphaDecay
      }
    } else {
      // 调整普通粒子的移动
      this.x += this.vx
      this.y += this.vy
      this.vy += 0.05  // 减小重力效果
      this.vx *= 0.99
      this.vy *= 0.99
      
      if (this.sparkle) {
        this.alpha = 0.6 + Math.abs(Math.sin(Date.now() * this.sparkleSpeed)) * 0.4
      } else {
        this.alpha -= this.alphaDecay
      }
    }
    
    // 更新颜色过渡
    if (isMultiColor.value && this.nextColor) {
      this.colorTransition += this.colorTransitionSpeed
      if (this.colorTransition >= 1) {
        this.color = this.nextColor
        this.nextColor = getRandomColor()
        this.colorTransition = 0
      }
    }

    // 只检查水平方向的边界，允许粒子继续下落
    if (this.x < -100 || this.x > width + 100) {
      this.active = false
      return false
    }

    return true
  }

  draw() {
    // 只在 alpha > 0 时绘制
    if (this.alpha <= 0) return

    // 绘制尾迹
    this.trail.forEach((point, index) => {
      const trailAlpha = (index / this.trail.length) * point.alpha * 0.3
      if (trailAlpha > 0) {
        ctx.beginPath()
        ctx.arc(point.x, point.y, this.size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${this.getRGB(this.color)}, ${trailAlpha})`
        ctx.fill()
      }
    })
    
    // 绘制主粒子
    let currentColor = this.color
    if (isMultiColor.value && this.nextColor && this.colorTransition < 1) {
      currentColor = this.interpolateColors(this.color, this.nextColor, this.colorTransition)
    }
    
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${this.getRGB(currentColor)}, ${this.alpha})`
    ctx.fill()
    
    // 简化光晕效果
    if (this.alpha > 0.2) {
      ctx.beginPath()
      ctx.arc(this.x, this.y, this.size * 1.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${this.getRGB(this.color)}, ${this.alpha * 0.1})`
      ctx.fill()
    }
  }

  getRGB(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? 
      `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : 
      '255, 255, 255'
  }

  // 添加颜色插值函数
  interpolateColors(color1, color2, factor) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color1)
    const result2 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color2)
    
    if (!result || !result2) return color1
    
    const r1 = parseInt(result[1], 16)
    const g1 = parseInt(result[2], 16)
    const b1 = parseInt(result[3], 16)
    
    const r2 = parseInt(result2[1], 16)
    const g2 = parseInt(result2[2], 16)
    const b2 = parseInt(result2[3], 16)
    
    const r = Math.round(r1 + (r2 - r1) * factor)
    const g = Math.round(g1 + (g2 - g1) * factor)
    const b = Math.round(b1 + (b2 - b1) * factor)
    
    return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
  }
}

// 添加获取文字点阵的函数
function getTextPoints(text, fontSize = 100) {
  // 创建临时 canvas 来获取文字点阵
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')
  tempCanvas.width = fontSize * text.length
  tempCanvas.height = fontSize * 1.5
  
  // 设置文字样式
  tempCtx.font = `bold ${fontSize}px Arial`
  tempCtx.fillStyle = 'white'
  tempCtx.textBaseline = 'middle'
  tempCtx.textAlign = 'center'
  
  // 绘制文字
  tempCtx.fillText(text, tempCanvas.width / 2, tempCanvas.height / 2)
  
  // 获取像素数据
  const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
  const pixels = imageData.data
  const points = []
  const step = 4  // 采样步长，可以调整以改变粒子密度
  
  // 扫描像素获取文字轮廓点
  for (let y = 0; y < tempCanvas.height; y += step) {
    for (let x = 0; x < tempCanvas.width; x += step) {
      const index = (y * tempCanvas.width + x) * 4
      const alpha = pixels[index + 3]
      
      if (alpha > 0) {
        points.push({
          x: x - tempCanvas.width / 2,
          y: y - tempCanvas.height / 2
        })
      }
    }
  }
  
  return points
}

// 添加粒子池管理函数
function getParticleFromPool(x, y, color, type, angle, textPosition) {
  let particle
  
  // 从池中查找非活跃粒子
  for (let i = 0; i < particlePool.length; i++) {
    if (!particlePool[i].active) {
      particle = particlePool[i]
      particle.init(x, y, color, type, angle, textPosition)
      return particle
    }
  }
  
  // 如果池中没有可用粒子且未达到最大数量，创建新粒子
  if (particlePool.length < PARTICLE_POOL_SIZE) {
    particle = new Particle(x, y, color, type, angle, textPosition)
    particlePool.push(particle)
    return particle
  }
  
  // 如果池已满，返回null
  return null
}

// 修改创建烟花函数
function createFirework(x, y, type = 'normal', text = '') {
  playSound('explosionSound', 0.6)
  
  const baseColor = getRandomColor()
  
  if (type === 'text') {
    const finalText = text || '新年快乐'
    const points = getTextPoints(finalText, 80)
    const step = 3
    
    points.forEach(point => {
      const color = isMultiColor.value ? getRandomColor() : baseColor
      const particle = getParticleFromPool(x, y, color, 'text', null, point)
      if (particle) particles.push(particle)
    })
    
    for (let i = 0; i < 50; i++) {
      const color = isMultiColor.value ? getRandomColor() : '#ffffff'
      const particle = getParticleFromPool(x, y, color, 'normal')
      if (particle) particles.push(particle)
    }
  } else {
    const particleCount = type === 'normal' ? 150 : 250
    
    if (type === 'normal') {
      for (let i = 0; i < particleCount; i++) {
        const color = isMultiColor.value ? getRandomColor() : baseColor
        const particle = getParticleFromPool(x, y, color, 'normal')
        if (particle) particles.push(particle)
      }
    } else if (type === 'circle' || type === 'heart' || type === 'spiral') {
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount
        const color = isMultiColor.value ? getRandomColor() : baseColor
        const particle = getParticleFromPool(x, y, color, type, angle)
        if (particle) particles.push(particle)
      }
    }
    
    // 增加装饰粒子数量
    for (let i = 0; i < 50; i++) {
      const color = isMultiColor.value ? getRandomColor() : '#ffffff'
      const particle = getParticleFromPool(x, y, color, 'normal')
      if (particle) particles.push(particle)
    }
  }
}

function launchRocket(targetX, targetY, type, text = '') {
  const colors = ['#ff8888', '#88ff88', '#8888ff']
  const color = colors[Math.floor(Math.random() * colors.length)]
  const isMobile = window.innerWidth <= 768
  const startX = isMobile ? (Math.random() * width) : width / 2
  const startY = height + 10
  
  rockets.push(new Rocket(
    startX,
    startY,
    targetX,
    targetY,
    color,
    type,
    text
  ))
}

function animate() {
  animationId = requestAnimationFrame(animate)
  ctx.clearRect(0, 0, width, height)
  
  // 应用缩放
  ctx.save()
  ctx.scale(scale.value, scale.value)
  
  // 更新火箭
  for (let i = rockets.length - 1; i >= 0; i--) {
    rockets[i].draw()
    if (rockets[i].update()) {
      createFirework(rockets[i].x, rockets[i].y, rockets[i].type, rockets[i].text)
      rockets.splice(i, 1)
    }
  }

  // 更新粒子
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i]
    if (!particle.active || !particle.update()) {
      particles.splice(i, 1)
      continue
    }
    particle.draw()
  }

  // 定期清理长时间不活跃的粒子
  if (particles.length > 1000) {
    particles = particles.filter(p => p.active)
  }
  
  ctx.restore()
}

// 修改发射烟花的函数
function addFirework(type = 'normal', text = '', x = null, y = null) {
  // 在移动端，调整烟花的发射范围
  const isMobile = window.innerWidth <= 768
  const targetX = x ?? (Math.random() * width * (isMobile ? 1.5 : 1) - (isMobile ? width * 0.25 : 0))
  const targetY = y ?? (isMobile ? height * 0.2 : height * 0.3)
  
  // 发送烟花数据到服务器
  if (isConnected.value) {
    const fireworkData = {
      type: 'firework',
      x: targetX,
      y: targetY,
      fireworkType: type,
      text: text,
      isMultiColorMode: isMultiColor.value
    }
    ws.value.send(JSON.stringify(fireworkData))
  }
  
  // 本地创建烟花
  playSound('launchSound', 0.4)
  launchRocket(targetX, targetY, type, text)
}

// 随机发射烟花
function randomFirework() {
  const types = ['normal', 'circle', 'heart', 'spiral']
  const type = types[Math.floor(Math.random() * types.length)]
  addFirework(type)
}

// 修改流星类
class Meteor {
  constructor() {
    this.reset()
  }

  reset() {
    // 起始位置在屏幕上方较广的范围
    this.x = Math.random() * width * 1.5 - width * 0.25
    this.y = -100
    this.length = Math.random() * 100 + 150
    this.speed = Math.random() * 15 + 8
    // 随机弧度角度
    this.angle = Math.PI / 4 + (Math.random() * 0.2 - 0.1)
    this.opacity = 1
    this.radius = Math.random() * 2000 + 1000 // 弧线半径
    this.arcAngle = 0 // 当前弧线角度
    this.trail = []
    this.maxTrailLength = 20
    // 流星颜色
    this.color = {
      r: 255,
      g: Math.floor(Math.random() * 55) + 200,
      b: Math.floor(Math.random() * 55) + 200
    }
  }

  draw() {
    // 绘制流星主体
    const gradient = bgCtx.createLinearGradient(
      this.x, 
      this.y, 
      this.x - this.length * Math.cos(this.angle),
      this.y - this.length * Math.sin(this.angle)
    )
    
    gradient.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity})`)
    gradient.addColorStop(0.1, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity * 0.8})`)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    // 保存轨迹点
    this.trail.push({ x: this.x, y: this.y })
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift()
    }

    // 绘制流星轨迹
    bgCtx.beginPath()
    bgCtx.moveTo(this.trail[0].x, this.trail[0].y)
    for (let i = 1; i < this.trail.length; i++) {
      bgCtx.lineTo(this.trail[i].x, this.trail[i].y)
    }
    bgCtx.strokeStyle = gradient
    bgCtx.lineWidth = 3
    bgCtx.stroke()

    // 绘制流星光晕
    bgCtx.beginPath()
    bgCtx.arc(this.x, this.y, 2, 0, Math.PI * 2)
    bgCtx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.opacity})`
    bgCtx.fill()
  }

  update() {
    this.arcAngle += this.speed / this.radius
    // 使用弧线轨迹计算新位置
    this.x += this.speed * Math.cos(this.angle)
    this.y += this.speed * Math.sin(this.angle) + Math.sin(this.arcAngle) * 0.5

    // 渐变消失
    if (this.y > height * 0.8) {
      this.opacity -= 0.02
    }

    if (this.y > height || this.opacity <= 0) {
      this.reset()
    }
  }
}

// 修改星星类
class Star {
  constructor() {
    this.reset()
  }

  reset() {
    this.x = Math.random() * width
    this.y = Math.random() * height
    this.size = Math.random() * 2.5
    this.blinkSpeed = Math.random() * 0.02
    this.brightness = Math.random()
    this.increasing = true
    this.color = {
      r: 255,
      g: 240 + Math.random() * 15,
      b: 200 + Math.random() * 55
    }
  }

  draw() {
    // 星星光晕效果
    const gradient = bgCtx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.size * 2
    )
    
    gradient.addColorStop(0, `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.brightness})`)
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

    bgCtx.beginPath()
    bgCtx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2)
    bgCtx.fillStyle = gradient
    bgCtx.fill()

    // 星星核心
    bgCtx.beginPath()
    bgCtx.arc(this.x, this.y, this.size * 0.5, 0, Math.PI * 2)
    bgCtx.fillStyle = `rgba(255, 255, 255, ${this.brightness})`
    bgCtx.fill()
  }

  update() {
    if (this.increasing) {
      this.brightness += this.blinkSpeed
      if (this.brightness >= 1) {
        this.increasing = false
      }
    } else {
      this.brightness -= this.blinkSpeed
      if (this.brightness <= 0.3) {
        this.increasing = true
      }
    }
  }
}

// 添加极光效果
function drawAurora() {
  const gradient = bgCtx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, 'rgba(10, 20, 40, 0.2)')
  gradient.addColorStop(0.3, 'rgba(15, 30, 60, 0.1)')
  gradient.addColorStop(0.6, 'rgba(20, 40, 80, 0.05)')
  gradient.addColorStop(1, 'rgba(30, 50, 90, 0.1)')
  
  bgCtx.fillStyle = gradient
  bgCtx.fillRect(0, 0, width, height)

  // 添加随机波动的极光
  const time = Date.now() * 0.001
  for (let i = 0; i < 3; i++) {
    bgCtx.beginPath()
    bgCtx.moveTo(0, height * 0.3)
    
    for (let x = 0; x < width; x += 50) {
      const y = Math.sin(x * 0.003 + time + i) * 50 + height * 0.3
      bgCtx.lineTo(x, y)
    }
    
    bgCtx.strokeStyle = `rgba(${30 + i * 20}, ${150 + i * 30}, ${100 + i * 50}, 0.1)`
    bgCtx.lineWidth = 50
    bgCtx.stroke()
  }
}

// 修改背景动画函数
function animateBackground() {
  requestAnimationFrame(animateBackground)
  bgCtx.fillStyle = 'rgba(5, 10, 20, 0.3)'
  bgCtx.fillRect(0, 0, width, height)
  
  // 应用缩放
  bgCtx.save()
  bgCtx.scale(scale.value, scale.value)
  
  drawAurora()
  
  // 更新星星
  stars.forEach(star => {
    star.update()
    star.draw()
  })

  // 更新流星
  meteors.forEach(meteor => {
    meteor.update()
    meteor.draw()
  })
  
  bgCtx.restore()
}

// 修改创建星空背景函数
function createStarryBackground() {
  const starCount = 300 // 增加星星数量
  for (let i = 0; i < starCount; i++) {
    stars.push(new Star())
  }

  // 增加流星数量
  for (let i = 0; i < 5; i++) {
    meteors.push(new Meteor())
  }
}

// 添加新的响应式变量
const showTouchHint = ref(true)
const touchStartY = ref(0)
const touchStartTime = ref(0)
const isPanelDragging = ref(false)

// 添加缩放相关的状态
const scale = ref(1)
const initialDistance = ref(0)

// 处理多点触控缩放
const handleGestureStart = (e) => {
  e.preventDefault()
  initialDistance.value = e.scale
}

const handleGestureChange = (e) => {
  e.preventDefault()
  const newScale = e.scale / initialDistance.value
  scale.value = Math.min(Math.max(0.5, newScale), 2) // 限制缩放范围在 0.5-2 倍之间
}

const handleGestureEnd = (e) => {
  e.preventDefault()
}

// 添加触摸相关函数
const handleTouchStart = (e) => {
  if (e.touches.length === 2) {
    // 双指触摸，准备缩放
    const touch1 = e.touches[0]
    const touch2 = e.touches[1]
    initialDistance.value = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
    return
  }
  
  if (e.target.closest('.mobile-control-panel') || 
      e.target.closest('.control-button') ||
      e.target.closest('.text-input-container')) {
    // 如果触摸的是控制面板或其他UI元素，不处理
    return
  }

  touchStartY.value = e.touches[0].clientY
  touchStartTime.value = Date.now()
  
  // 隐藏触摸提示
  showTouchHint.value = false
}

const handleTouchMove = (e) => {
  if (e.touches.length === 2) {
    // 处理双指缩放
    const touch1 = e.touches[0]
    const touch2 = e.touches[1]
    const currentDistance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
    const newScale = currentDistance / initialDistance.value
    scale.value = Math.min(Math.max(0.5, newScale), 2)
    return
  }
  
  if (isPanelDragging.value) {
    const deltaY = e.touches[0].clientY - touchStartY.value
    // 处理面板拖动逻辑
  }
}

const handleTouchEnd = (e) => {
  if (e.target.closest('.mobile-control-panel') || 
      e.target.closest('.control-button') ||
      e.target.closest('.text-input-container')) {
    return
  }

  const touchEndTime = Date.now()
  const touchDuration = touchEndTime - touchStartTime.value

  // 如果是快速点击（小于300ms），发射烟花
  if (touchDuration < 300) {
    const rect = e.target.getBoundingClientRect()
    const x = e.changedTouches[0].clientX
    const y = e.changedTouches[0].clientY - rect.top
    
    // 随机选择烟花类型
    const types = ['normal', 'circle', 'heart', 'spiral']
    const randomType = types[Math.floor(Math.random() * types.length)]
    
    addFirework(randomType, '', x, y)
  }
}

onMounted(() => {
  // 设置背景 canvas
  bgCtx = bgCanvas.value.getContext('2d')
  bgCtx.fillStyle = 'black'
  bgCtx.fillRect(0, 0, width, height)
  
  // 设置烟花 canvas
  ctx = canvas.value.getContext('2d')
  ctx.globalCompositeOperation = 'lighter'
  
  // 初始化星空背景
  createStarryBackground()
  animateBackground()
  
  // 启动动画
  animate()
  
  // 自动发射烟花
  setInterval(() => {
    if (Math.random() > 0.5) { // 50%的概率发射
      const types = ['normal', 'circle', 'heart', 'spiral']
      const type = types[Math.floor(Math.random() * types.length)]
      addFirework(type)
    }
  }, 2000)

  console.log('组件已加载，等待音频初始化...')

  connectWebSocket()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationId)
  if (ws.value) {
    ws.value.close()
  }
  // 清空粒子池
  particlePool.length = 0
  particles.length = 0
  rockets.length = 0
})
</script>

<style scoped>
/* 媒体查询：小屏幕时调整按钮样式 */
@media (max-width: 600px) {
  .launch-btn {
    padding: 8px 12px; /* 减小按钮内边距 */
    font-size: 14px; /* 减小字体大小 */
  }
}
.fireworks-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: black;
  overflow: hidden;
  touch-action: none; /* 防止默认的触摸行为 */
}

canvas {
  position: absolute;
  top: 0;
  left: 0;
}

.buttons {
  display: flex;
  flex-direction: column; /* 垂直排列 */
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  gap: 10px; /* 按钮间距 */
  z-index: 100;
}

.launch-btn {
  padding: 12px 20px; /* 增加按钮内边距 */
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid white;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 100%; /* 按钮全宽 */
  margin-bottom: 10px; /* 按钮间距 */
}

.launch-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.launch-btn:active {
  transform: scale(0.95); /* 按钮缩小效果 */
}

.sound-btn {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.text-input-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  padding: 10px;
  border-radius: 5px;
  backdrop-filter: blur(5px);
}

.text-input {
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 16px;
  outline: none;
  transition: all 0.3s ease;
}

.text-input:focus {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.2);
}

.text-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.close-btn {
  padding: 8px 12px;
  font-size: 18px;
  line-height: 1;
}

.connection-status {
  position: fixed;
  top: 10px;
  right: 10px;
  padding: 5px 10px;
  border-radius: 5px;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  z-index: 1000;
}

.connection-status.connected {
  background: rgba(0, 128, 0, 0.5);
}
.launch-btn:active {
  transform: scale(0.95); /* 按钮缩小效果 */
}

/* 移动端样式 */
@media (max-width: 768px) {
  .control-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 1001;
    backdrop-filter: blur(5px);
    transition: all 0.3s ease;
  }

  .control-icon {
    color: white;
    font-size: 24px;
    line-height: 1;
  }

  .mobile-control-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    padding: 20px 15px calc(env(safe-area-inset-bottom) + 20px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 1000;
    border-radius: 20px 20px 0 0;
    touch-action: none;
  }

  .panel-header {
    width: 100%;
    height: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 10px;
  }

  .handle-bar {
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
  }

  .button-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    max-width: 600px;
    margin: 0 auto;
  }

  .launch-btn {
    padding: 12px 8px;
    font-size: 14px;
    white-space: nowrap;
    margin: 0;
    width: 100%;
    height: 50px;
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
  }

  .text-input-container {
    bottom: auto;
    top: 20px;
    width: 90%;
    max-width: 300px;
  }

  .touch-hint {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 255, 255, 0.2);
    padding: 10px 20px;
    border-radius: 20px;
    color: white;
    font-size: 14px;
    backdrop-filter: blur(5px);
    animation: fadeOut 3s forwards;
    pointer-events: none;
  }

  @keyframes fadeOut {
    0% { opacity: 1; }
    70% { opacity: 1; }
    100% { opacity: 0; }
  }

  .control-button {
    bottom: 30px;
    right: 30px;
    width: 60px;
    height: 60px;
    background: rgba(255, 255, 255, 0.15);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
}

/* 添加过渡动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}

/* 桌面端样式 */
@media (min-width: 769px) {
  .control-button {
    display: none;
  }

  .mobile-control-panel {
    display: none;
  }

  .buttons {
    display: flex;
    flex-direction: column;
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    gap: 10px;
    z-index: 100;
    background: none;
    padding: 0;
  }
}

/* 添加安全区域适配 */
@supports (padding: max(0px)) {
  .mobile-control-panel {
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
}

/* 桌面端按钮样式 */
.desktop-buttons {
  display: none; /* 默认隐藏 */
}

/* 桌面端样式 */
@media (min-width: 769px) {
  .control-button {
    display: none;
  }

  .mobile-control-panel {
    display: none;
  }

  .desktop-buttons {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    gap: 10px;
    z-index: 100;
    padding: 0;
    width: auto;
    max-width: 90%;
  }

  .desktop-buttons .launch-btn {
    padding: 12px 20px;
    font-size: 16px;
    margin-bottom: 0;
    white-space: nowrap;
    width: auto;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    backdrop-filter: blur(5px);
  }

  .desktop-buttons .launch-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
  }
}

/* 移动端样式 */
@media (max-width: 768px) {
  .desktop-buttons {
    display: none;
  }
  /* ... 其他移动端样式保持不变 ... */
}
</style>

