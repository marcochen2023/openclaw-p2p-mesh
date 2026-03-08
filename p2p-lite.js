/**
 * OpenClaw P2P Lite
 * 简化版P2P通信，无需复杂依赖，立即可用
 * 支持：UDP局域网发现 + 文件共享跨网络通信
 */

const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const readline = require('readline');

// 配置
const CONFIG = {
  UDP_PORT: 19876,
  BROADCAST_INTERVAL: 5000,
  MESSAGE_DIR: path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw/p2p-messages'),
  DISCOVERY_FILE: path.join(process.env.HOME || process.env.USERPROFILE, '.openclaw/p2p-discovery.json'),
  PEER_TIMEOUT: 30000
};

class OpenClawP2PLite {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.alias = options.alias || this.id;
    this.discovery = options.discovery || false;
    
    this.peers = new Map(); // 发现的节点
    this.socket = null;
    this.broadcastInterval = null;
    
    // 确保目录存在
    if (!fs.existsSync(CONFIG.MESSAGE_DIR)) {
      fs.mkdirSync(CONFIG.MESSAGE_DIR, { recursive: true });
    }
  }

  generateId() {
    return 'p2p-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  async init() {
    console.log(`[P2P] 🚀 Initializing OpenClaw P2P Lite...`);
    console.log(`[P2P] 📡 My ID: ${this.id} (${this.alias})`);
    
    // 创建UDP socket
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    this.socket.on('message', (msg, rinfo) => {
      this.handleMessage(msg, rinfo);
    });
    
    this.socket.on('error', (err) => {
      console.error(`[P2P] ❌ Socket error:`, err.message);
    });
    
    // 绑定端口
    this.socket.bind(CONFIG.UDP_PORT, () => {
      this.socket.setBroadcast(true);
      console.log(`[P2P] ✅ UDP socket bound to port ${CONFIG.UDP_PORT}`);
      
      // 启动广播
      this.startBroadcasting();
      
      // 启动文件监听（用于跨网络通信）
      this.startFileWatcher();
      
      // 如果启用发现模式，写入发现文件
      if (this.discovery) {
        this.enableDiscovery();
      }
      
      // 启动交互界面
      this.startInteractiveMode();
    });
  }

  startBroadcasting() {
    const broadcastMessage = JSON.stringify({
      type: 'announce',
      id: this.id,
      alias: this.alias,
      timestamp: Date.now(),
      address: this.getLocalIP()
    });
    
    this.broadcastInterval = setInterval(() => {
      this.socket.send(
        broadcastMessage,
        0,
        broadcastMessage.length,
        CONFIG.UDP_PORT,
        '255.255.255.255'
      );
    }, CONFIG.BROADCAST_INTERVAL);
    
    // 立即广播一次
    this.socket.send(
      broadcastMessage,
      0,
      broadcastMessage.length,
      CONFIG.UDP_PORT,
      '255.255.255.255'
    );
  }

  handleMessage(msg, rinfo) {
    try {
      const data = JSON.parse(msg.toString());
      
      if (data.id === this.id) return; // 忽略自己的消息
      
      switch (data.type) {
        case 'announce':
          this.handleAnnounce(data, rinfo);
          break;
        case 'message':
          this.handleDirectMessage(data, rinfo);
          break;
        case 'broadcast':
          this.handleBroadcast(data, rinfo);
          break;
      }
    } catch (e) {
      // 忽略无效消息
    }
  }

  handleAnnounce(data, rinfo) {
    const existing = this.peers.get(data.id);
    
    this.peers.set(data.id, {
      id: data.id,
      alias: data.alias,
      address: rinfo.address,
      port: rinfo.port,
      lastSeen: Date.now()
    });
    
    if (!existing) {
      console.log(`[P2P] 🟢 Discovered: ${data.alias} (${data.id}) at ${rinfo.address}`);
    }
  }

  handleDirectMessage(data, rinfo) {
    console.log(`\n💬 [私信] ${data.alias}: ${data.message}\n`);
    this.logMessage('direct', data);
  }

  handleBroadcast(data, rinfo) {
    console.log(`\n📢 [广播] ${data.alias}: ${data.message}\n`);
    this.logMessage('broadcast', data);
    
    // 如果是命令，尝试执行
    if (data.message.startsWith('/')) {
      this.executeCommand(data.message, data);
    }
  }

  sendMessage(targetId, message) {
    const peer = this.peers.get(targetId);
    if (!peer) {
      console.log(`[P2P] ❌ Peer ${targetId} not found`);
      // 尝试通过文件系统发送（跨网络）
      this.sendViaFile(targetId, message);
      return;
    }
    
    const msg = JSON.stringify({
      type: 'message',
      id: this.id,
      alias: this.alias,
      message,
      timestamp: Date.now()
    });
    
    this.socket.send(msg, 0, msg.length, CONFIG.UDP_PORT, peer.address);
    console.log(`[P2P] 📨 Sent to ${targetId}: ${message}`);
  }

  broadcastMessage(message) {
    const msg = JSON.stringify({
      type: 'broadcast',
      id: this.id,
      alias: this.alias,
      message,
      timestamp: Date.now()
    });
    
    this.socket.send(msg, 0, msg.length, CONFIG.UDP_PORT, '255.255.255.255');
    console.log(`[P2P] 📢 Broadcast: ${message}`);
  }

  // 通过文件系统发送（用于跨网络/互联网）
  sendViaFile(targetId, message) {
    const msgFile = path.join(CONFIG.MESSAGE_DIR, `to-${targetId}-${Date.now()}.json`);
    fs.writeFileSync(msgFile, JSON.stringify({
      from: this.id,
      alias: this.alias,
      to: targetId,
      message,
      timestamp: Date.now()
    }));
    console.log(`[P2P] 💾 Message queued for ${targetId} (file-based)`);
  }

  // 监听文件系统消息（用于跨网络接收）
  startFileWatcher() {
    setInterval(() => {
      try {
        const files = fs.readdirSync(CONFIG.MESSAGE_DIR);
        
        for (const file of files) {
          if (file.startsWith(`to-${this.id}-`) && file.endsWith('.json')) {
            const filepath = path.join(CONFIG.MESSAGE_DIR, file);
            const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            
            console.log(`\n💬 [离线消息] ${data.alias}: ${data.message}\n`);
            
            // 删除已处理的消息
            fs.unlinkSync(filepath);
          }
        }
      } catch (e) {
        // 忽略错误
      }
    }, 2000);
  }

  enableDiscovery() {
    const discoveryData = {
      id: this.id,
      alias: this.alias,
      online: true,
      lastSeen: Date.now(),
      address: this.getLocalIP()
    };
    
    fs.writeFileSync(CONFIG.DISCOVERY_FILE, JSON.stringify(discoveryData, null, 2));
    
    // 定期更新
    setInterval(() => {
      discoveryData.lastSeen = Date.now();
      fs.writeFileSync(CONFIG.DISCOVERY_FILE, JSON.stringify(discoveryData, null, 2));
    }, 10000);
  }

  executeCommand(command, from) {
    const cmd = command.slice(1).split(' ')[0];
    const args = command.slice(1).split(' ').slice(1);
    
    console.log(`[P2P] ⚡ Executing command from ${from.alias}: ${cmd} ${args.join(' ')}`);
    
    // 这里可以集成OpenClaw命令
    switch (cmd) {
      case 'status':
        this.broadcastMessage(`/response ${this.id} is online, peers: ${this.peers.size}`);
        break;
      case 'openclaw':
        console.log(`[P2P] 🦐 Received OpenClaw command: ${args.join(' ')}`);
        // 写入OpenClaw可读取的命令文件
        const cmdFile = path.join(CONFIG.MESSAGE_DIR, '.openclaw-incoming.json');
        fs.writeFileSync(cmdFile, JSON.stringify({
          from: from.id,
          alias: from.alias,
          command: args.join(' '),
          timestamp: Date.now()
        }));
        break;
    }
  }

  logMessage(type, data) {
    const logFile = path.join(CONFIG.MESSAGE_DIR, 'message-log.jsonl');
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      type,
      from: data.alias,
      message: data.message
    });
    fs.appendFileSync(logFile, logEntry + '\n');
  }

  getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  listPeers() {
    console.log('\n📋 Connected Peers:');
    this.peers.forEach((peer, id) => {
      const age = Date.now() - peer.lastSeen;
      const status = age < CONFIG.PEER_TIMEOUT ? '🟢' : '🟡';
      console.log(`  ${status} ${peer.alias} (${id}) @ ${peer.address}`);
    });
    if (this.peers.size === 0) {
      console.log('  (No peers discovered yet)');
    }
    console.log();
  }

  startInteractiveMode() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║    OpenClaw P2P Lite v1.0 (运行中)      ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`\n命令:`);
    console.log(`  send <id> <msg>    - 发送私信`);
    console.log(`  broadcast <msg>    - 广播消息`);
    console.log(`  list               - 列出节点`);
    console.log(`  myid               - 显示我的ID`);
    console.log(`  help               - 显示帮助`);
    console.log(`  exit               - 退出\n`);

    const ask = () => {
      rl.question(`[${this.alias}]> `, (input) => {
        this.handleCommand(input.trim());
        ask();
      });
    };

    ask();
  }

  handleCommand(input) {
    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'send':
        if (args.length >= 2) {
          this.sendMessage(args[0], args.slice(1).join(' '));
        } else {
          console.log('用法: send <节点ID> <消息>');
        }
        break;

      case 'broadcast':
      case 'bc':
        if (args.length > 0) {
          this.broadcastMessage(args.join(' '));
        } else {
          console.log('用法: broadcast <消息>');
        }
        break;

      case 'list':
      case 'ls':
        this.listPeers();
        break;

      case 'myid':
      case 'id':
        console.log(`\n我的ID: ${this.id}`);
        console.log(`别名: ${this.alias}`);
        console.log(`IP: ${this.getLocalIP()}`);
        console.log(`端口: ${CONFIG.UDP_PORT}\n`);
        break;

      case 'help':
      case '?':
        console.log('\n命令: send, broadcast/list, myid, help, exit\n');
        break;

      case 'exit':
      case 'quit':
        console.log('👋 Goodbye!');
        this.cleanup();
        process.exit(0);
        break;

      default:
        if (input) {
          console.log(`未知命令: ${cmd}，输入 help 查看可用命令`);
        }
    }
  }

  cleanup() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    if (this.socket) {
      this.socket.close();
    }
    
    // 更新发现文件为离线状态
    try {
      const discoveryFile = CONFIG.DISCOVERY_FILE;
      if (fs.existsSync(discoveryFile)) {
        const data = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
        data.online = false;
        fs.writeFileSync(discoveryFile, JSON.stringify(data, null, 2));
      }
    } catch (e) {
      // 忽略
    }
  }
}

// 启动
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--id' && args[i + 1]) {
    options.id = args[i + 1];
  }
  if (args[i] === '--alias' && args[i + 1]) {
    options.alias = args[i + 1];
  }
  if (args[i] === '--discovery') {
    options.discovery = true;
  }
}

const p2p = new OpenClawP2PLite(options);
p2p.init();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n[P2P] 正在关闭...');
  p2p.cleanup();
  process.exit(0);
});
