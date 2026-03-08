# Quick Start Guide

## Installation

```bash
# Clone the repository
git clone https://github.com/TigerZen1213/openclaw-p2p-mesh.git
cd openclaw-p2p-mesh

# Install dependencies
npm install
```

## Start Your First Agent

```bash
# Terminal 1: Start controller agent
node p2p-lite.js --id controller --alias "Controller" --discovery
```

## Connect from Another Device

```bash
# Terminal 2: On another computer/device
node p2p-lite.js --id node1 --alias "Node 1"

# In the console, type:
connect controller
send controller Hello from Node 1!
```

## Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `send <id> <msg>` | Send direct message | `send controller Task done` |
| `broadcast <msg>` | Broadcast to all | `broadcast /status` |
| `bc <msg>` | Short for broadcast | `bc Hello all` |
| `list` / `ls` | List connected peers | `list` |
| `myid` / `id` | Show my ID | `myid` |
| `help` / `?` | Show help | `help` |
| `exit` / `quit` | Exit gracefully | `exit` |

## OpenClaw Integration

Send OpenClaw commands via P2P:

```bash
# In P2P console
send node1 /openclaw --prompt "Analyze this file"
broadcast /openclaw --task "backup_all"
```

## Cross-Network Communication

For devices not on the same LAN, use file-based communication:

1. Sync `~/.openclaw/p2p-messages/` directory using:
   - Git repository
   - Dropbox
   - Synology Drive
   - Any file sync service

2. Messages will be automatically exchanged

## Docker (Optional)

```bash
# Build Docker image
docker build -t openclaw-p2p .

# Run container
docker run -p 19876:19876/udp openclaw-p2p
```

## Support

- 📖 [Full Documentation](README.md)
- 🎓 [OpenClaw SKILL Guide](SKILL.md)
- 🐛 [Issue Tracker](../../issues)

---

**Happy P2P Networking!** 🐯🌐