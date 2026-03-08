#!/bin/bash
# OpenClaw P2P Mesh Auto-Setup Script for Mac

echo "=========================================="
echo "OpenClaw P2P Mesh 一键安装脚本"
echo "=========================================="

# 1. 创建目录
mkdir -p ~/.openclaw/workspace/github/openclaw-p2p-mesh
mkdir -p ~/.openclaw/p2p-messages

# 2. 下载 p2p-lite.js (如果GitHub仓库可用)
cd ~/.openclaw/workspace/github/openclaw-p2p-mesh

# 尝试从GitHub克隆，或者使用内联代码
if [ -d ".git" ]; then
    git pull
else
    # 使用curl直接获取文件内容
    curl -sL "https://raw.githubusercontent.com/TigerZen1213/openclaw-p2p-mesh/main/p2p-lite.js" -o p2p-lite.js 2>/dev/null || echo "需要手动创建文件"
fi

# 3. 创建内联版本(如果下载失败)
if [ ! -s p2p-lite.js ]; then
cat > p2p-lite.js << 'PNODE'
const dgram = require('dgram'), fs = require('fs'), path = require('path'), os = require('os'), rl = require('readline');
const CFG = { UDP:19876, INT:5000, DIR:path.join(process.env.HOME||'','.openclaw/p2p-messages') };
!fs.existsSync(CFG.DIR)&&fs.mkdirSync(CFG.DIR,{recursive:true});
class P{constructor(o={}){this.id=o.id||'p2p-'+Math.random().toString(36).substr(2,8).toUpperCase();this.alias=o.alias||this.id;this.peers=new Map();this.s=null}
init(){console.log('[P2P] 🚀 Starting P2P Mesh...\nID: '+this.id+' ('+this.alias+')');this.s=dgram.createSocket({type:'udp4',reuseAddr:true});
this.s.on('message',(m,r)=>this.rcv(m,r));this.s.bind(CFG.UDP,()=>{this.s.setBroadcast(true);console.log('[P2P] ✅ UDP Port '+CFG.UDP);this.br();this.wf();this.cli()})}
br(){const a=JSON.stringify({t:'a',i:this.id,a:this.alias});setInterval(()=>this.s.send(a,0,a.length,CFG.UDP,'255.255.255.255'),CFG.INT);this.s.send(a,0,a.length,CFG.UDP,'255.255.255.255')}
rcv(m,r){try{let d=JSON.parse(m);if(d.i==this.id);else if(d.t=='a'){if(!this.peers.has(d.i))console.log('[P2P] 🟢 '+d.a+' ('+d.i+')');this.peers.set(d.i,{i:d.i,a:d.a,ad:r.address})}}catch(e){}}
send(t,m){let p=this.peers.get(t);if(p){let msg=JSON.stringify({t:'m',i:this.id,a:this.alias,m:m});this.s.send(msg,0,msg.length,CFG.UDP,p.ad)}else console.log('[P2P] ❌ '+t+' not found')}
bc(m){let msg=JSON.stringify({t:'m',i:this.id,a:this.alias,m:m});this.s.send(msg,0,msg.length,CFG.UDP,'255.255.255.255');console.log('[P2P] 📢 '+m)}
wf(){setInterval(()=>{try{fs.readdirSync(CFG.DIR).forEach(f=>{if(f.startsWith('to-'+this.id)){let d=JSON.parse(fs.readFileSync(path.join(CFG.DIR,f)));console.log('\n💬 ['+d.f+']: '+d.m+'\n');fs.unlinkSync(path.join(CFG.DIR,f))}})}catch(e){}},2000)}
cli(){console.log('\n命令: send <id> <msg>, bc <msg>, list, myid, exit\n');let i=rl.createInterface({input:process.stdin,output:process.stdout});i.question('['+this.alias+']> ',x=>{let p=x.trim().split(' '),c=p[0].toLowerCase();if(c=='send'&&p.length>2)this.send(p[1],p.slice(2).join(' '));else if(c=='bc')this.bc(p.slice(1).join(' '));else if(c=='list'){console.log('\n📋 Peers:');this.peers.forEach((v,k)=>console.log(' 🟢 '+v.a+' ('+k+')'));console.log()}else if(c=='myid')console.log('\nID: '+this.id+'\nAlias: '+this.alias+'\n');else if(c=='exit')process.exit(0);this.cli()})}}
}
let o={};process.argv.forEach((v,i)=>{if(v=='--id'&&process.argv[i+1])o.id=process.argv[i+1];if(v=='--alias'&&process.argv[i+1])o.alias=process.argv[i+1]});new P(o).init();
PNODE
fi

# 4. 启动P2P
echo ""
echo "=========================================="
echo "启动 P2P Mesh..."
echo "ID: tiger-macbook"
echo "=========================================="
node p2p-lite.js --id tiger-macbook --alias "MacBook节点"
