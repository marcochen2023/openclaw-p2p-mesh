#!/usr/bin/env node

/**
 * OpenClaw P2P Messenger
 * 为OpenClaw提供P2P通信功能的简化接口
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const P2P_DIR = path.join(process.env.HOME, '.openclaw/p2p-mesh');
const MESSAGE_DIR = path.join(P2P_DIR, 'messages');

// 确保目录存在
if (!fs.existsSync(MESSAGE_DIR)) {
  fs.mkdirSync(MESSAGE_DIR, { recursive: true });
}

function sendP2P(target, message) {
  const msgFile = path.join(MESSAGE_DIR, `send-${Date.now()}.json`);
  fs.writeFileSync(msgFile, JSON.stringify({
    action: 'send',
    target,
    message,
    timestamp: Date.now()
  }));
  console.log(`P2P message queued for ${target}`);
}

function broadcastP2P(message) {
  const msgFile = path.join(MESSAGE_DIR, `broadcast-${Date.now()}.json`);
  fs.writeFileSync(msgFile, JSON.stringify({
    action: 'broadcast',
    message,
    timestamp: Date.now()
  }));
  console.log('P2P broadcast queued');
}

function discoverPeers() {
  const discoveryFile = path.join(P2P_DIR, 'discovery.json');
  if (fs.existsSync(discoveryFile)) {
    const data = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
    return data.peers || [];
  }
  return [];
}

function status() {
  const myIdFile = path.join(P2P_DIR, 'my-id.json');
  if (fs.existsSync(myIdFile)) {
    const data = JSON.parse(fs.readFileSync(myIdFile, 'utf8'));
    console.log(`P2P Agent: ${data.alias || data.id}`);
    console.log(`Status: ${data.online ? 'Online' : 'Offline'}`);
    console.log(`Peers: ${data.connectedPeers || 0}`);
  } else {
    console.log('P2P not initialized');
  }
}

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'send':
    if (args.length < 2) {
      console.log('Usage: oc-p2p send <target-id> <message>');
      process.exit(1);
    }
    sendP2P(args[0], args.slice(1).join(' '));
    break;

  case 'broadcast':
    if (args.length < 1) {
      console.log('Usage: oc-p2p broadcast <message>');
      process.exit(1);
    }
    broadcastP2P(args.join(' '));
    break;

  case 'discover':
    const peers = discoverPeers();
    console.log('Discovered peers:');
    peers.forEach(p => console.log(`  - ${p.alias} (${p.id})`));
    break;

  case 'status':
    status();
    break;

  case 'start':
    console.log('Starting P2P Bridge...');
    const bridge = spawn('node', [path.join(__dirname, 'p2p-bridge.js'), ...args], {
      stdio: 'inherit',
      detached: true
    });
    bridge.unref();
    console.log('P2P Bridge started in background');
    break;

  default:
    console.log('OpenClaw P2P Messenger');
    console.log('');
    console.log('Commands:');
    console.log('  oc-p2p start [options]    Start P2P Bridge');
    console.log('  oc-p2p send <id> <msg>    Send message to peer');
    console.log('  oc-p2p broadcast <msg>    Broadcast to all peers');
    console.log('  oc-p2p discover           List discovered peers');
    console.log('  oc-p2p status             Show P2P status');
    console.log('');
    console.log('Examples:');
    console.log('  oc-p2p start --id my-agent --discovery');
    console.log('  oc-p2p send agent-123 "Hello from OpenClaw!"');
    console.log('  oc-p2p broadcast "/task analyze-logs"');
}
