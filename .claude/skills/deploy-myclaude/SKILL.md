---
name: deploy-myclaude
description: 构建并部署 HAPI 到 MyClaude 专用实例（myclaude.1to10.cn），本机 luxiang 专用。自动做 HAPI→MyClaude 品牌替换 + 自定义图标 + 缓存破坏 + 密码认证 + 禁用 default namespace。Use when the user asks to "部署 myclaude", "deploy my", "发 my", "myclaude 发版", "更新 myclaude".
argument-hint: [hub|web|all]
---

# Deploy MyClaude

构建并部署 HAPI 组件到 **MyClaude 专用实例**（本机 luxiang 专用 Hub）。

## 部署目标

| 组件 | 本地构建输出 | 远程目标路径 |
|------|-------------|-------------|
| Hub | `hub/dist/index.js` | `ubuntu@myclaude.1to10.cn:~/hapi-myclaude/index.js` |
| Web | `web/dist/`（处理后） | `ubuntu@myclaude.1to10.cn:~/hapi-myclaude/web/dist/` |

- Hub 域名：`https://myclaude.1to10.cn`
- 服务器：`ubuntu@myclaude.1to10.cn`（与 mokaclaude 同一台物理机，端口 3007）
- PM2 进程名：`hapi-hub-myclaude`
- HAPI_HOME：`/home/ubuntu/.hapi-myclaude/`
- Base CLI Token：`my2026`（存储在 `ubuntu@myclaude.1to10.cn:~/.hapi-myclaude/settings.json`）

## 特殊分支：密码 + MyClaude 功能

所有 mokaclaude / myclaude 专属改动都在 **`mokaclaude-password-auth` 分支**（勿合 main）。部署时：

1. `git checkout mokaclaude-password-auth`
2. 跑下面的构建 + 部署流程
3. `git checkout main`（保留分支，不 merge）

## Workflow

1. **解析参数**：`hub` / `web` / `all`。

2. **递增版本号**：读写 `web/build-number.json`。

3. **构建**
   ```bash
   cd /Users/luxiang/workspace/hapi
   bun run build:hub
   bun run build:web
   ```

4. **部署 Hub**
   ```bash
   scp hub/dist/index.js ubuntu@myclaude.1to10.cn:~/hapi-myclaude/index.js

   # Patch: 禁用 default namespace（必须带 :namespace 才能登录）
   ssh ubuntu@myclaude.1to10.cn 'python3 <<PYEOF
from pathlib import Path
p = Path.home() / "hapi-myclaude/index.js"
s = p.read_text()
old = """if (separatorIndex === -1) {
    return { baseToken: trimmed, namespace: DEFAULT_NAMESPACE };
  }"""
new = """if (separatorIndex === -1) {
    return null;
  }"""
if old in s: p.write_text(s.replace(old, new)); print("patched")
else: print("already patched or source changed")
PYEOF'
   ```

5. **部署 Web**
   ```bash
   rsync -az --delete web/dist/ ubuntu@myclaude.1to10.cn:~/hapi-myclaude/web/dist/

   # MyClaude 品牌化 + zh-CN + 隐藏 Terminal + 改 bundle 名破缓存
   ssh ubuntu@myclaude.1to10.cn 'bash -s' <<'REMOTE'
cd ~/hapi-myclaude/web/dist
for f in index.html 404.html manifest.webmanifest sw.js assets/index-*.js; do
  [ -f "$f" ] && sed -i "s/HAPI/MyClaude/g" "$f"
done
sed -i 's|<html lang="en">|<html lang="zh-CN">|g' index.html 404.html
python3 <<'PYEOF'
import glob
for f in glob.glob("assets/index-*.js"):
    s = open(f).read()
    new = s.replace('hapi-lang");return l==="en"||l==="zh-CN"?l:"en"', 'hapi-lang");return l==="en"||l==="zh-CN"?l:"zh-CN"')
    if new != s: open(f,"w").write(new)
PYEOF
# ⚠️ 不要给 index-*.js/css 改名破缓存！Vite 文件名自带 content hash 天然破缓存。
# 改名只替换得到 index.html/sw.js 的引用，但几十个懒加载 chunk（mermaid/vendor 等）
# 内部 import 的还是原名 → 全部 404 断链（2026-07-03 踩坑：上传/聊天渲染全挂）。
STYLE='<style>button[aria-label="Terminal"],button[aria-label="终端"]{display:none!important}</style>'
grep -q 'aria-label="终端"' index.html || sed -i "s|</head>|${STYLE}</head>|" index.html
REMOTE

   # 覆盖自定义图标
   SKILL_DIR=/Users/luxiang/workspace/hapi/.claude/skills/deploy-myclaude
   scp $SKILL_DIR/icons/*.png $SKILL_DIR/icons/*.ico $SKILL_DIR/icons/*.svg \
     ubuntu@myclaude.1to10.cn:~/hapi-myclaude/web/dist/
   ```

6. **重启**
   ```bash
   ssh ubuntu@myclaude.1to10.cn "pm2 restart hapi-hub-myclaude"
   ```

7. **报告**：新版本号、各组件状态、提示浏览器刷新。

## 本机 Runner

本机 `lux` 命名空间 runner 独立：
- Settings: `~/.hapi-mylux/settings.json` (token `my2026:lux`, apiUrl `https://myclaude.1to10.cn`)
- Plist: `~/Library/LaunchAgents/com.hapi.runner.mylux.plist`
- Log: `~/.hapi-mylux/runner-launchd.log`

新增 namespace 模板：
```bash
NS=<name>
HAPI_HOME=/Users/luxiang/.hapi-my$NS
mkdir -p $HAPI_HOME
cat > $HAPI_HOME/settings.json <<EOF
{"cliApiToken":"my2026:$NS","apiUrl":"https://myclaude.1to10.cn","machineId":"$(uuidgen|tr A-Z a-z)"}
EOF
# plist 参考 com.hapi.runner.mylux.plist
```

## 注意事项

- **只部署 MyClaude 实例**，和 mokaclaude、主 hapi 互不干扰。
- Web 每次部署都重新跑**品牌化 + 图标 + 破缓存**，否则看到残留或旧版本。
- 图标源文件在 `icons/`（咖啡棕圆角方 + 白色 M），换图标直接替换里面的 PNG/ICO/SVG。
- 部署后刷浏览器 / PWA 重装获取新 bundle。
- Hub base token 若改了，本机 runner 的 `~/.hapi-mylux/settings.json` 也要同步更新。
- 密码存储：`ubuntu@myclaude.1to10.cn:~/.hapi-myclaude/passwords.json`（bcrypt，chmod 600）

## 故障排查

- PM2：`ssh ubuntu@myclaude.1to10.cn "pm2 logs hapi-hub-myclaude --lines 50 --nostream"`
- Nginx：`/etc/nginx/sites-available/myclaude.1to10.cn`
- 证书：`/etc/letsencrypt/live/myclaude.1to10.cn/`
- 本机 runner：`tail ~/.hapi-mylux/runner-launchd.log`
