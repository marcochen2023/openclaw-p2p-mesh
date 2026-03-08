---
name: openclaw-p2p-communication
description: "P2P端对端通信技能，让多个OpenClaw Agent互相通信、协调任务、广播命令，无需公网IP或VPS"
version: "1.0.0"
---

# OpenClaw P2P 通信网络技能

实现多个OpenClaw Agent之间的去中心化P2P通信网络，基于WebRTC技术，支持NAT穿透，无需公网IP或中心服务器。

## 核心功能

- 🌐 **P2P直连** - WebRTC NAT穿透，内网设备直接通信
- 📢 **广播命令** - 向所有Agent发送命令并收集结果
- 🤖 **OpenClaw集成** - Agent之间互相分配任务
- 🔍 **自动发现** - 自动发现网络中的其他Agent
- 🔐 **端到端加密** - 数据传输安全

## 快速开始

### 1. 启动P2P Bridge

```bash
# 在设备A（主控）
cd ~/.openclaw/workspace/openclaw-p2p-mesh
npm install
node p2p-bridge.js --id controller --alias "主控" --discovery

# 输出示例：
# [P2P] My ID: controller (主控)
# [P2P] ✅ Connected, my ID: controller
```

```bash
# 在设备B（节点）
node p2p-bridge.js --id node1 --alias "节点1"

# 在控制台输入：
connect controller
```

### 2. 在OpenClaw中使用P2P通信

**发送消息给指定Agent：**
```yaml
- action: p2p_send
  target: "node1"
  message: "请帮我分析这个文件"
  wait_response: true
  timeout: 30000
```

**广播命令给所有Agent：**
```yaml
- action: p2p_broadcast
  command: "system_check"
  args:
    target: "all_agents"
  collect_responses: true
  timeout: 60000
```

**发现网络中的Agent：**
```yaml
- action: p2p_discover
  save_as: available_agents
- action: log
  message: "发现 {{available_agents.length}} 个在线Agent"
```

## 通信模式

### 模式1: 单播 (Unicast)
一对一通信，指定目标Agent ID。

```yaml
- action: p2p_unicast
  to: "node-laptop"
  payload:
    type: "task_request"
    task: "图像识别"
    data: "./image.jpg"
  expect_reply: true
```

### 模式2: 广播 (Broadcast)
向所有已连接Agent发送消息。

```yaml
- action: p2p_broadcast
  payload:
    type: "announcement"
    message: "开始系统维护"
  exclude_self: true
```

### 模式3: 多播 (Multicast)
向指定组发送消息。

```yaml
- action: p2p_multicast
  targets: ["node1", "node2", "node3"]
  payload:
    type: "parallel_task"
    job_id: "job-001"
```

## Agent协调任务示例

**场景：** 主控Agent需要将一个大任务分发给多个子Agent并行处理

```yaml
# 1. 发现可用Agent
- action: p2p_discover
  filter: "capability=distributed_compute"
  save_as: workers

# 2. 分割任务
- action: split_task
  total_items: 1000
  num_workers: "{{workers.length}}"
  save_as: task_chunks

# 3. 分发任务到各个Agent
- action: loop
  items: "{{workers}}"
  as: worker
  index_as: i
  do:
    - action: p2p_send
      target: "{{worker.id}}"
      payload:
        type: "process_chunk"
        chunk: "{{task_chunks[i]}}"
        job_id: "distributed-job-001"
      async: true

# 4. 等待所有结果
- action: p2p_wait_all
  job_id: "distributed-job-001"
  expected_count: "{{workers.length}}"
  timeout: 120000
  save_as: results

# 5. 合并结果
- action: merge_results
  sources: "{{results}}"
  save_as: final_output
```

## OpenClaw 互教互学场景

**场景：** Agent A教Agent B如何配置OpenClaw

```yaml
# Agent A (教师端) 发送配置指南
- action: p2p_send
  target: "new-agent"
  payload:
    type: "tutorial"
    topic: "openclaw_setup"
    steps:
      - "1. 安装Node.js: brew install node"
      - "2. 安装OpenClaw: npm install -g openclaw"
      - "3. 初始化配置: openclaw init"
    resources:
      - url: "https://docs.openclaw.ai/setup"

# Agent B (学生端) 收到后执行
- action: on_p2p_message
  filter:
    type: "tutorial"
  do:
    - action: execute_shell
      command: "{{message.steps[0]}}"
    - action: p2p_reply
      payload:
        type: "progress"
        step: 1
        status: "completed"
```

## 命令行参考

**P2P Bridge控制台命令：**

| 命令 | 功能 | 示例 |
|------|------|------|
| `connect <id>` | 连接指定Agent | `connect tiger-laptop` |
| `broadcast <msg>` | 广播消息 | `broadcast /status check` |
| `msg <id> <text>` | 发送私信 | `msg node1 Hello` |
| `cmd <id> <cmd>` | 发送OpenClaw命令 | `cmd node1 openclaw --help` |
| `list` | 列出已连接 | `list` |
| `discovery` | 发现新Agent | `discovery` |

## 配置文件

`~/.openclaw/p2p-config.json`:

```json
{
  "agentId": "my-agent",
  "alias": "我的OpenClaw",
  "discovery": true,
  "autoConnect": ["controller", "home-server"],
  "trustedPeers": ["controller", "laptop", "server"],
  "capabilities": ["compute", "file-storage", "web-search"],
  "maxPeers": 20,
  "encryption": true
}
```

## 实用场景

### 场景1: 家庭多设备协调
```bash
# Raspberry Pi (IoT Hub)
node p2p-bridge.js --id home-hub --discovery

# MacBook (开发机)
node p2p-bridge.js --id dev-mac --alias "开发Mac"
connect home-hub

# iPhone (移动端)
node p2p-bridge.js --id mobile --alias "手机"
connect home-hub
```

现在你可以从手机发送命令让Mac执行任务！

### 场景2: 跨地域团队协作
```bash
# 台北 (Team Lead)
node p2p-bridge.js --id taipei-lead --alias "台北负责人" --discovery

# 东京 (Developer)
node p2p-bridge.js --id tokyo-dev --alias "东京开发"
connect taipei-lead

# 新加坡 (Server)
node p2p-bridge.js --id singapore-server --alias "新加坡服务器"
connect taipei-lead
```

### 场景3: 边缘计算网络
```yaml
# 主控Agent分发计算任务
- action: p2p_broadcast
  command: "compute_task"
  args:
    algorithm: "matrix_multiply"
    data_chunk: "{{chunk}}"
    return_result: true
```

## 故障排除

**问题: 无法连接到其他Agent**
- 检查双方是否都能访问互联网
- 尝试更换STUN/TURN服务器
- 检查防火墙设置

**问题: 消息丢失**
- 启用可靠传输模式
- 检查网络稳定性
- 增加重试机制

**问题: ID冲突**
- 每个Agent使用唯一ID
- 使用自动生成的UUID

## 安全建议

1. **仅连接可信Agent** - 验证所有连接方的身份
2. **启用加密** - 使用端到端加密传输敏感数据
3. **定期更换ID** - 避免长期固定ID带来的风险
4. **网络隔离** - 敏感操作在隔离网络中进行

## 扩展阅读

- [WebRTC原理](https://webrtc.org/)
- [PeerJS文档](https://peerjs.com/docs/)
- [OpenClaw技能开发指南](https://docs.openclaw.ai/skills)

---

**让OpenClaw们自由协作！** 🐯🌐