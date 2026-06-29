---
name: mokaclaude-accounts
description: 管理 MokaClaude (mokaclaude.1to10.cn) 的用户账号（namespace）。支持新增、列表、删除、重置密码。触发词：mokaclaude 账号、moka 账号、moka 新增用户、moka 加人、mokaclaude 加账号、moka 删账号、moka 重置密码、mokaclaude namespace。
---

# MokaClaude 账号管理

管理 mokaclaude.1to10.cn 实例的用户账号（每个账号 = 一个 namespace + 密码 + 独立 runner）。

## 基础设施

| 组件 | 位置 |
|------|------|
| Hub 服务器 | `ubuntu@mokaclaude.1to10.cn` |
| Hub PM2 进程 | `hapi-hub` |
| Hub 密码文件 | `~/.hapi/passwords.json` |
| Hub Base Token | `moka2026` |
| Runner 机器 | `ssh moka`（Moka Mac mini） |
| Runner Binary | `/opt/homebrew/bin/hapi` |
| Claude Binary | `/Users/moka/.local/bin/claude` |

## 操作

### 1. 新增账号

参数：`<name>` — 账号名（英文小写，如 `zhangsan`）

**步骤（按顺序执行）：**

```bash
# A. Hub 端：添加密码（默认 moka123，首次登录强制改密）
ssh ubuntu@mokaclaude.1to10.cn 'python3 -c "
import json, subprocess
p = \"/home/ubuntu/.hapi/passwords.json\"
with open(p) as f:
    data = json.load(f)
result = subprocess.run([\"python3\", \"-c\", \"import bcrypt; print(bcrypt.hashpw(b\\\"moka123\\\", bcrypt.gensalt(12)).decode())\"], capture_output=True, text=True)
h = result.stdout.strip()
data[\"passwords\"][\"<name>\"] = {\"hash\": h, \"mustChange\": True}
with open(p, \"w\") as f:
    json.dump(data, f, indent=2)
print(\"added <name>\")
"'

# B. Hub 端：创建 namespace 目录
ssh ubuntu@mokaclaude.1to10.cn 'mkdir -p ~/.hapi/ns/<name>'

# C. Runner 端：创建工作目录
ssh moka 'mkdir -p ~/ns/<name>'

# D. Runner 端：生成 machineId 并创建 settings
MACHINE_ID=$(python3 -c 'import uuid; print(uuid.uuid4())')
ssh moka "mkdir -p ~/.hapi-<name> && cat > ~/.hapi-<name>/settings.json << EOF
{
    \"cliApiToken\": \"moka2026:<name>\",
    \"apiUrl\": \"https://mokaclaude.1to10.cn\",
    \"machineId\": \"$MACHINE_ID\"
}
EOF"

# E. Runner 端：创建 LaunchAgent plist
ssh moka "cat > ~/Library/LaunchAgents/com.hapi.runner.<name>.plist << 'PLIST'
<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\">
<dict>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HAPI_CLAUDE_PATH</key>
        <string>/Users/moka/.local/bin/claude</string>
        <key>HAPI_HOME</key>
        <string>/Users/moka/.hapi-<name></string>
        <key>HOME</key>
        <string>/Users/moka</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>Label</key>
    <string>com.hapi.runner.<name></string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/hapi</string>
        <string>runner</string>
        <string>start-sync</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/Users/moka/.hapi-<name>/runner-launchd.log</string>
    <key>StandardOutPath</key>
    <string>/Users/moka/.hapi-<name>/runner-launchd.log</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>WorkingDirectory</key>
    <string>/Users/moka/ns/<name></string>
</dict>
</plist>
PLIST"

# F. Runner 端：加载并启动
ssh moka 'launchctl load ~/Library/LaunchAgents/com.hapi.runner.<name>.plist'

# G. Hub 端：重启 hub 使密码生效
ssh ubuntu@mokaclaude.1to10.cn 'pm2 restart hapi-hub'

# H. 验证：检查 runner 启动日志
sleep 3
ssh moka 'tail -3 ~/.hapi-<name>/runner-launchd.log'
```

**完成后汇报：**
- 地址：https://mokaclaude.1to10.cn
- 用户名：`<name>`
- 初始密码：`moka123`（首次登录强制改密）
- 工作目录：`/Users/moka/ns/<name>`

### 2. 列出所有账号

```bash
# 密码文件中的账号
ssh ubuntu@mokaclaude.1to10.cn 'python3 -c "
import json
d = json.load(open(\"/home/ubuntu/.hapi/passwords.json\"))
for name, info in d.get(\"passwords\", {}).items():
    mc = \"(需改密)\" if info.get(\"mustChange\") else \"\"
    print(f\"  {name} {mc}\")
"'

# Runner 状态
ssh moka 'launchctl list | grep com.hapi.runner'
```

### 3. 删除账号

参数：`<name>` — 要删除的账号名

**先确认！删除操作不可逆。**

```bash
# A. Runner 端：停止并卸载 LaunchAgent
ssh moka 'launchctl unload ~/Library/LaunchAgents/com.hapi.runner.<name>.plist 2>/dev/null'
ssh moka 'rm -f ~/Library/LaunchAgents/com.hapi.runner.<name>.plist'

# B. Hub 端：删除密码
ssh ubuntu@mokaclaude.1to10.cn 'python3 -c "
import json
p = \"/home/ubuntu/.hapi/passwords.json\"
with open(p) as f:
    data = json.load(f)
if \"<name>\" in data.get(\"passwords\", {}):
    del data[\"passwords\"][\"<name>\"]
    with open(p, \"w\") as f:
        json.dump(data, f, indent=2)
    print(\"removed <name>\")
else:
    print(\"<name> not found\")
"'

# C. Hub 端：重启
ssh ubuntu@mokaclaude.1to10.cn 'pm2 restart hapi-hub'

# D. Runner 端配置保留（不删 ~/.hapi-<name> 和 ~/ns/<name>，避免误删数据）
# 如需彻底清理：
# ssh moka 'rm -rf ~/.hapi-<name> ~/ns/<name>'
```

### 4. 重置密码

参数：`<name>` — 要重置密码的账号名

```bash
ssh ubuntu@mokaclaude.1to10.cn 'python3 -c "
import json, subprocess
p = \"/home/ubuntu/.hapi/passwords.json\"
with open(p) as f:
    data = json.load(f)
if \"<name>\" not in data.get(\"passwords\", {}):
    print(\"ERROR: <name> not found\")
else:
    result = subprocess.run([\"python3\", \"-c\", \"import bcrypt; print(bcrypt.hashpw(b\\\"moka123\\\", bcrypt.gensalt(12)).decode())\"], capture_output=True, text=True)
    h = result.stdout.strip()
    data[\"passwords\"][\"<name>\"] = {\"hash\": h, \"mustChange\": True}
    with open(p, \"w\") as f:
        json.dump(data, f, indent=2)
    print(\"reset <name> to moka123\")
"'

# 重启 hub
ssh ubuntu@mokaclaude.1to10.cn 'pm2 restart hapi-hub'
```

### 5. 重启 Runner

参数：`<name>` — runner 名

```bash
ssh moka 'launchctl stop com.hapi.runner.<name> && launchctl start com.hapi.runner.<name>'
sleep 3
ssh moka 'tail -3 ~/.hapi-<name>/runner-launchd.log'
```

## 注意事项

- 账号名只用英文小写字母，不要带特殊字符
- 默认密码统一 `moka123`，`mustChange: true` 强制首次登录改密
- 每个账号 = 独立 namespace + 独立 runner 进程 + 独立工作目录
- Token 格式：`moka2026:<name>`（base token + namespace）
- Runner 工作目录：`/Users/moka/ns/<name>`
- 删除账号时默认保留数据目录，需要手动确认才彻底清理
- Moka Mac mini 需要在线（通过 `ssh moka` 可达）
- 操作前先确认 Moka 可连：`ssh moka 'whoami'`
