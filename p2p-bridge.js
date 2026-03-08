/**
 * OpenClaw P2P Mesh Bridge
 * 基于 PeerJS 的端对端通信工具
 * 无需公网IP，NAT穿透，多Agent互联
 * 
 * 使用方法:
 * 1. node p2p-bridge.js --id my-agent --discovery
 * 2. 其他Agent用你的ID连接
 * 3. 收发消息进行协调
 */

const { Peer } = require('peerjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { program } = require('commander');

// 配置
const CONFIG = {
  PEER_JS_HOST: '0.peerjs.com', // PeerJS 免费信令服务器
  PEER_JS_PORT: 443,
  PEER_JS_PATH: '/',
  PING_INTERVAL: 30000,
  RECONNECT_DELAY: 5000,
  MAX_RETRIES: 5
};

class OpenClawP2PBridge {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.alias = options.alias || this.id;
    this.discovery = options.discovery || false; // 是否开启发现模式
    this.peers = new Map(); // 已连接的对等节点
    this.pendingMessages = new Map(); // 待发送消息队列
    this.commandHandlers = new Map(); // 命令处理器
    this.networkState = new Map(); // 网络状态
    this.messageHistory = []; // 消息历史
    this.maxHistory = 100;
    
    // OpenClaw 集成配置
    this.openclawHook = options.openclawHook || null;
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    this.workspaceDir = options.workspaceDir || path.join(homeDir, '.openclaw/workspace');
    
    this.peer = null;
    this.isInitialized = false;
  }

  generateId() {
    return 'oc-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }

  async init() {
    console.log(`[P2P] Initializing OpenClaw Bridge...`);
    console.log(`[P2P] My ID: ${this.id} (${this.alias})`);
    
    // 创建 PeerJS 实例
    this.peer = new Peer(this.id, {
      host: CONFIG.PEER_JS_HOST,
      port: CONFIG.PEER_JS_PORT,
      path: CONFIG.PEER_JS_PATH,
      secure: true,
      debug: 2
    });

    this.setupPeerEvents();
    this.setupLifecycle();
    
    // 如果开启发现模式，创建发现文件
    if (this.discovery) {
      this.enableDiscovery();
    }

    // 启动OpenClaw钩子
    this.setupOpenClawIntegration();
    
    this.isInitialized = true;
    
    // 启动UI
    this.startInteractiveMode();
  }

  setupPeerEvents() {
    // 连接建立
    this.peer.on('open', (id) => {
      console.log(`[P2P] ✅ Connected to signaling server, my ID: ${id}`);
      this.broadcastSystem('online', { id, alias: this.alias, timestamp: Date.now() });
    });

    // 收到连接请求
    this.peer.on('connection', (conn) => {
      console.log(`[P2P] 📥 Incoming connection from: ${conn.peer}`);
      this.handleConnection(conn);
    });

    // 错误处理
    this.peer.on('error', (err) => {
      console.error(`[P2P] ❌ Error: ${err.type}`, err.message);
      this.handleError(err);
    });

    // 断开连接
    this.peer.on('disconnected', () => {
      console.log('[P2P] ⚠️ Disconnected from signaling server, attempting reconnect...');
      this.peer.reconnect();
    });

    this.peer.on('close', () => {
      console.log('[P2P] 🔴 Connection closed');
    });
  }

  handleConnection(conn) {
    this.setupConnectionEvents(conn);
    this.peers.set(conn.peer, {
      connection: conn,
      state: 'connecting',
      lastSeen: Date.now(),
      metadata: {}
    });
  }

  setupConnectionEvents(conn) {
    conn.on('open', () => {
      console.log(`[P2P] ✅ Peer connected: ${conn.peer}`);
      const peerInfo = this.peers.get(conn.peer);
      if (peerInfo) {
        peerInfo.state = 'connected';
        peerInfo.lastSeen = Date.now();
      }
      
      // 发送握手信息
      conn.send({
        type: 'handshake',
        from: this.id,
        alias: this.alias,
        timestamp: Date.now(),
        capabilities: ['command', 'broadcast', 'file-transfer']
      });
    });

    conn.on('data', (data) => {
      this.handleMessage(conn.peer, data);
    });

    conn.on('close', () => {
      console.log(`[P2P] 🔴 Peer disconnected: ${conn.peer}`);
      this.peers.delete(conn.peer);
    });

    conn.on('error', (err) => {
      console.error(`[P2P] ❌ Connection error with ${conn.peer}:`, err);
      this.peers.delete(conn.peer);
    });
  }

  handleMessage(fromPeerId, data) {
    const timestamp = new Date().toISOString();
    
    // 记录消息历史
    this.messageHistory.push({
      timestamp,
      from: fromPeerId,
      data
    });
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }

    switch (data.type) {
      case 'handshake':
        this.handleHandshake(fromPeerId, data);
        break;
      case 'command':
        this.handleCommand(fromPeerId, data);
        break;
      case 'broadcast':
        this.handleBroadcast(fromPeerId, data);
        break;
      case 'response':
        this.handleResponse(fromPeerId, data);
        break;
      case 'system':
        this.handleSystemMessage(fromPeerId, data);
        break;
      default:
        console.log(`[P2P] 📨 Message from ${fromPeerId}:`, data);
    }
  }

  handleHandshake(fromPeerId, data) {
    const peerInfo = this.peers.get(fromPeerId);
    if (peerInfo) {
      peerInfo.metadata = {
        alias: data.alias,
        capabilities: data.capabilities,
        connectedAt: data.timestamp
      };
    }
    console.log(`[P2P] 🤝 Handshake with ${data.alias || fromPeerId}, capabilities: ${data.capabilities?.join(', ')}`);
  }

  handleCommand(fromPeerId, data) {
    console.log(`[P2P] ⚡ Command from ${fromPeerId}: ${data.command}`);
    
    // 转发给OpenClaw处理
    if (this.openclawHook) {
      this.executeInOpenClaw(data.command, data.args, fromPeerId);
    }

    // 执行本地命令处理器
    const handler = this.commandHandlers.get(data.command);
    if (handler) {
      const result = handler(data.args, fromPeerId);
      this.sendTo(fromPeerId, {
        type: 'response',
        inReplyTo: data.messageId,
        result,
        timestamp: Date.now()
      });
    }
  }

  handleBroadcast(fromPeerId, data) {
    console.log(`[P2P] 📢 Broadcast from ${fromPeerId}: ${data.message}`);
    // 显示在控制台
    console.log(`\n💬 [${data.alias || fromPeerId}]: ${data.message}\n`);
    
    // 如果是命令广播，执行
    if (data.message.startsWith('/')) {
      const cmd = data.message.slice(1).split(' ')[0];
      const args = data.message.slice(1).split(' ').slice(1);
      this.handleCommand(fromPeerId, { command: cmd, args, messageId: data.messageId });
    }
  }

  handleResponse(fromPeerId, data) {
    console.log(`[P2P] 📤 Response from ${fromPeerId}:`, data.result);
  }

  handleSystemMessage(fromPeerId, data) {
    switch (data.event) {
      case 'online':
        console.log(`[P2P] 🟢 Agent ${data.alias || data.id} is online`);
        break;
      case 'offline':
        console.log(`[P2P] 🔴 Agent ${data.alias || data.id} went offline`);
        this.peers.delete(data.id);
        break;
      case 'discovery':
        console.log(`[P2P] 🔍 Discovered agents:`, data.agents);
        break;
    }
  }

  // 连接到其他Peer
  connectTo(targetId) {
    if (this.peers.has(targetId)) {
      console.log(`[P2P] Already connected to ${targetId}`);
      return;
    }

    console.log(`[P2P] 🔄 Connecting to: ${targetId}`);
    const conn = this.peer.connect(targetId, {
      reliable: true,
      serialization: 'json'
    });

    this.handleConnection(conn);
    return conn;
  }

  // 发送消息到指定Peer
  sendTo(targetId, message) {
    const peerInfo = this.peers.get(targetId);
    if (peerInfo && peerInfo.state === 'connected') {
      peerInfo.connection.send(message);
      return true;
    } else {
      console.log(`[P2P] ⚠️ Peer ${targetId} not connected, message queued`);
      this.pendingMessages.set(targetId, message);
      this.connectTo(targetId);
      return false;
    }
  }

  // 广播消息到所有已连接Peer
  broadcast(message, excludeSelf = false) {
    const payload = {
      type: 'broadcast',
      message,
      from: this.id,
      alias: this.alias,
      messageId: crypto.randomUUID(),
      timestamp: Date.now()
    };

    let count = 0;
    this.peers.forEach((peerInfo, peerId) => {
      if (peerInfo.state === 'connected') {
        peerInfo.connection.send(payload);
        count++;
      }
    });

    console.log(`[P2P] 📢 Broadcasted to ${count} peers`);
    return count;
  }

  // 发送命令到指定Peer
  sendCommand(targetId, command, args = {}) {
    return this.sendTo(targetId, {
      type: 'command',
      command,
      args,
      messageId: crypto.randomUUID(),
      timestamp: Date.now()
    });
  }

  // 注册命令处理器
  registerCommand(command, handler) {
    this.commandHandlers.set(command, handler);
  }

  // OpenClaw集成
  setupOpenClawIntegration() {
    // 监听OpenClaw消息文件
    const msgDir = path.join(this.workspaceDir, '.p2p-messages');
    if (!fs.existsSync(msgDir)) {
      fs.mkdirSync(msgDir, { recursive: true });
    }

    // 定期检查新消息
    setInterval(() => {
      this.checkOpenClawMessages(msgDir);
    }, 1000);

    // 注册OpenClaw命令
    this.registerCommand('openclaw', (args, from) => {
      console.log(`[P2P] Executing OpenClaw command from ${from}:`, args);
      // 写入OpenClaw可读取的文件
      const cmdFile = path.join(this.workspaceDir, '.incoming-p2p-command.json');
      fs.writeFileSync(cmdFile, JSON.stringify({
        from,
        command: args.cmd,
        timestamp: Date.now()
      }, null, 2));
      return { status: 'executed', cmd: args.cmd };
    });
  }

  checkOpenClawMessages(msgDir) {
    try {
      const files = fs.readdirSync(msgDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filepath = path.join(msgDir, file);
          const msg = JSON.parse(fs.readFileSync(filepath, 'utf8'));
          
          if (msg.target === 'broadcast') {
            this.broadcast(msg.content);
          } else if (msg.target) {
            this.sendTo(msg.target, msg.content);
          }
          
          // 删除已处理的消息
          fs.unlinkSync(filepath);
        }
      }
    } catch (e) {
      // 忽略错误
    }
  }

  executeInOpenClaw(command, args, fromPeer) {
    const cmdFile = path.join(this.workspaceDir, '.p2p-incoming.json');
    fs.writeFileSync(cmdFile, JSON.stringify({
      type: 'p2p-command',
      from: fromPeer,
      command,
      args,
      timestamp: Date.now()
    }, null, 2));
  }

  // 启用发现模式（将ID写入共享位置）
  enableDiscovery() {
    const discoveryFile = path.join(this.workspaceDir, '.p2p-discovery.json');
    fs.writeFileSync(discoveryFile, JSON.stringify({
      id: this.id,
      alias: this.alias,
      online: true,
      lastSeen: Date.now(),
      capabilities: ['command', 'broadcast']
    }, null, 2));

    console.log(`[P2P] 🔍 Discovery enabled, ID written to: ${discoveryFile}`);

    // 定期更新
    setInterval(() => {
      fs.writeFileSync(discoveryFile, JSON.stringify({
        id: this.id,
        alias: this.alias,
        online: true,
        lastSeen: Date.now(),
        capabilities: ['command', 'broadcast']
      }, null, 2));
    }, 30000);
  }

  // 发现其他Agent
  discoverAgents() {
    const discoveryDir = this.workspaceDir;
    const agents = [];
    
    try {
      const files = fs.readdirSync(discoveryDir);
      for (const file of files) {
        if (file.startsWith('.p2p-discovery') && file.endsWith('.json')) {
          const data = JSON.parse(fs.readFileSync(path.join(discoveryDir, file), 'utf8'));
          if (data.id !== this.id && data.online && (Date.now() - data.lastSeen < 60000)) {
            agents.push(data);
          }
        }
      }
    } catch (e) {
      // 忽略
    }

    return agents;
  }

  // 交互式控制台
  startInteractiveMode() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(`\n╔════════════════════════════════════════╗`);
    console.log(`║    OpenClaw P2P Mesh Bridge v1.0       ║`);
    console.log(`╚════════════════════════════════════════╝`);
    console.log(`\nCommands:`);
    console.log(`  connect <peer-id>  - Connect to another agent`);
    console.log(`  msg <peer-id> <text> - Send message to peer`);
    console.log(`  broadcast <text>   - Broadcast to all peers`);
    console.log(`  cmd <peer-id> <cmd> - Send command to peer`);
    console.log(`  list               - List connected peers`);
    console.log(`  discovery          - Discover online agents`);
    console.log(`  help               - Show this help`);
    console.log(`  exit               - Exit gracefully\n`);

    const ask = () => {
      rl.question(`[${this.alias}]$ `, (input) => {
        this.handleCommandLine(input.trim());
        ask();
      });
    };

    ask();
  }

  handleCommandLine(input) {
    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case 'connect':
        if (args[0]) {
          this.connectTo(args[0]);
        } else {
          console.log('Usage: connect <peer-id>');
        }
        break;

      case 'msg':
        if (args.length >= 2) {
          const targetId = args[0];
          const message = args.slice(1).join(' ');
          this.sendTo(targetId, { type: 'chat', message });
          console.log(`Sent to ${targetId}: ${message}`);
        } else {
          console.log('Usage: msg <peer-id> <message>');
        }
        break;

      case 'broadcast':
        if (args.length > 0) {
          const message = args.join(' ');
          this.broadcast(message);
        } else {
          console.log('Usage: broadcast <message>');
        }
        break;

      case 'cmd':
        if (args.length >= 2) {
          const targetId = args[0];
          const command = args[1];
          const cmdArgs = args.slice(2);
          this.sendCommand(targetId, command, cmdArgs);
        } else {
          console.log('Usage: cmd <peer-id> <command> [args...]');
        }
        break;

      case 'list':
        console.log('\nConnected peers:');
        this.peers.forEach((info, id) => {
          const meta = info.metadata || {};
          console.log(`  ◉ ${meta.alias || id} (${info.state}) - ${meta.capabilities?.join(', ') || 'unknown'}`);
        });
        if (this.peers.size === 0) {
          console.log('  (none)');
        }
        console.log();
        break;

      case 'discovery':
        const agents = this.discoverAgents();
        console.log(`\nDiscovered ${agents.length} agents:`);
        agents.forEach(agent => {
          console.log(`  ● ${agent.alias} (${agent.id}) - ${JSON.stringify(agent.capabilities)}`);
        });
        console.log();
        break;

      case 'help':
        console.log('\nCommands: connect, msg, broadcast, cmd, list, discovery, help, exit\n');
        break;

      case 'exit':
        console.log('Goodbye!');
        process.exit(0);
        break;

      default:
        if (input) {
          console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
        }
    }
  }

  handleError(err) {
    // 错误处理逻辑
    if (err.type === 'unavailable-id') {
      console.error(`[P2P] ❌ ID ${this.id} is already taken! Please choose another.`);
      process.exit(1);
    }
  }

  setupLifecycle() {
    // 优雅退出
    process.on('SIGINT', () => {
      console.log('\n[P2P] Shutting down gracefully...');
      this.broadcast('system', { event: 'offline', id: this.id, alias: this.alias });
      this.peer.destroy();
      process.exit(0);
    });
  }
}

// CLI 入口
program
  .option('-i, --id <id>', 'P2P ID for this agent')
  .option('-a, --alias <alias>', 'Human-readable alias')
  .option('-d, --discovery', 'Enable discovery mode', false)
  .option('--hook <path>', 'OpenClaw message hook path')
  .option('--workspace <path>', 'OpenClaw workspace path');

program.parse();

const options = program.opts();

const bridge = new OpenClawP2PBridge({
  id: options.id,
  alias: options.alias,
  discovery: options.discovery,
  openclawHook: options.hook,
  workspaceDir: options.workspace
});

bridge.init().catch(console.error);
