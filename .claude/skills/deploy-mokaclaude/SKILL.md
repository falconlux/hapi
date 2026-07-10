---
name: deploy-mokaclaude
description: 构建并部署 HAPI 到 MokaClaude 专用实例（mokaclaude.1to10.cn）。自动做 HAPI→MokaClaude 品牌替换 + 自定义图标 + 缓存破坏。Moka 机器专用。Use when the user asks to "部署 mokaclaude", "deploy moka", "发 moka", "mokaclaude 发版", "更新 mokaclaude", or wants to deploy to the MokaClaude hub.
argument-hint: [hub|web|cli|all]
---

# Deploy MokaClaude

构建并部署 HAPI 组件到 **MokaClaude 专用实例**（Moka 机器用的独立 Hub）。

## 部署目标

| 组件 | 本地构建输出 | 远程目标路径 |
|------|-------------|-------------|
| Hub | `hub/dist/index.js` | `ubuntu@mokaclaude.1to10.cn:~/hapi-custom/index.js` |
| Web | `web/dist/`（处理后） | `ubuntu@mokaclaude.1to10.cn:~/hapi-custom/web/dist/` |
| CLI | `cli/dist-exe/bun-darwin-arm64/hapi` | `moka:/opt/homebrew/lib/node_modules/@twsxtd/hapi/node_modules/@twsxtd/hapi-darwin-arm64/bin/hapi` |

- Hub 域名：`https://mokaclaude.1to10.cn`
- 服务器：`ubuntu@mokaclaude.1to10.cn`（passwordless sudo 可用）
- PM2 进程名：`hapi-hub`
- SSH 到 Moka：`ssh moka`（配置在 `~/.ssh/config`）

## Workflow

1. **解析参数** - `$ARGUMENTS` 同 deploy-hapi：`hub` / `web` / `cli` / `all`，多个用空格分隔，空则部署全部。

2. **递增版本号** - 读写 `web/build-number.json`，`build` 加 1。

3. **构建**
   ```bash
   # Hub
   cd /Users/luxiang/workspace/hapi && bun run build:hub

   # Web
   cd /Users/luxiang/workspace/hapi && bun run build:web

   # CLI
   cd /Users/luxiang/workspace/hapi/cli && bun run build:exe
   ```

4. **Web 品牌化**（只部署 web 或 all 时）
   ```bash
   cd /Users/luxiang/workspace/hapi/web/dist

   # a. 文本替换 HAPI → MokaClaude（只替换用户可见的大写 HAPI；hapi- 小写前缀是 localStorage key，保留）
   for f in index.html 404.html manifest.webmanifest sw.js assets/index-*.js; do
     [ -f "$f" ] && sed -i '' 's/HAPI/MokaClaude/g' "$f"
   done

   # b. 覆盖自定义图标（从 skill 资源目录）
   SKILL_DIR=/Users/luxiang/workspace/hapi/.claude/skills/deploy-mokaclaude
   cp "$SKILL_DIR"/icons/*.png "$SKILL_DIR"/icons/*.ico "$SKILL_DIR"/icons/*.svg .

   # b2. html lang en -> zh-CN
   sed -i '' 's|<html lang="en">|<html lang="zh-CN">|g' index.html 404.html

   # b3. JS 默认语言 fallback en -> zh-CN
   python3 <<'PYEOF'
import glob
for f in glob.glob("assets/index-*.js"):
    s = open(f).read()
    new = s.replace(
        'hapi-lang");return l==="en"||l==="zh-CN"?l:"en"',
        'hapi-lang");return l==="en"||l==="zh-CN"?l:"zh-CN"'
    )
    if new != s:
        open(f,"w").write(new)
PYEOF

   # b4. 隐藏 Terminal 按钮
   STYLE='<style>button[aria-label="Terminal"],button[aria-label="终端"]{display:none!important}</style>'
   grep -q 'aria-label="终端"' index.html || sed -i '' "s|</head>|${STYLE}</head>|" index.html

   # c. ⚠️ 不要给 index-*.js/css 改名破缓存！Vite 文件名自带 content hash 天然破缓存。
   # 改名只替换得到 index.html/sw.js 的引用，但几十个懒加载 chunk（mermaid/vendor 等）
   # 内部 import 的还是原名 → 全部 404 断链（2026-07-03 踩坑：上传/聊天渲染全挂）。
   ```

5. **部署**
   ```bash
   # Hub
   scp hub/dist/index.js ubuntu@mokaclaude.1to10.cn:~/hapi-custom/index.js

   # Hub 特殊补丁：禁用裸 baseToken（必须带 namespace），保持本地源纯净、只改远端构建产物
   ssh ubuntu@mokaclaude.1to10.cn 'python3 -c "
from pathlib import Path
p = Path.home() / \"hapi-custom/index.js\"
s = p.read_text()
old = \"\"\"if (separatorIndex === -1) {
    return { baseToken: trimmed, namespace: DEFAULT_NAMESPACE };
  }\"\"\"
new = \"\"\"if (separatorIndex === -1) {
    return null;
  }\"\"\"
if old in s:
    p.write_text(s.replace(old, new))
    print(\"patched\")
else:
    print(\"pattern not found — may have already been patched or source changed\")
"'

   # Web
   rsync -az --delete web/dist/ ubuntu@mokaclaude.1to10.cn:~/hapi-custom/web/dist/

   # CLI -> Moka（远程机）
   scp cli/dist-exe/bun-darwin-arm64/hapi \
     moka:/opt/homebrew/lib/node_modules/@twsxtd/hapi/node_modules/@twsxtd/hapi-darwin-arm64/bin/hapi
   ssh moka 'codesign -s - -f /opt/homebrew/lib/node_modules/@twsxtd/hapi/node_modules/@twsxtd/hapi-darwin-arm64/bin/hapi'
   ```

6. **重启**
   ```bash
   # Hub 或 Web 部署后重启 PM2
   ssh ubuntu@mokaclaude.1to10.cn "pm2 restart hapi-hub"

   # CLI 部署后杀 Moka 上旧 session 进程，让 runner 用新 binary
   ssh moka "ps aux | grep 'hapi.*claude' | grep -v grep | awk '{print \$2}' | xargs kill 2>/dev/null || true"
   ```

7. **报告结果**
   - 新版本号（cli/package.json version + web/build-number.json build）
   - 各组件部署状态
   - 提示浏览器刷新 / 重装 PWA

## 密码认证功能

"访问令牌 + 密码"双因素登录已在 **main 分支**（2026-07-10 起原 `mokaclaude-password-auth` 分支合入 main 并删除，备份 ref `backup/moka-pw-20260710`）。**直接从 main 部署。**

**功能要点（已在源码里实现）：**
- `hub/src/config/passwordStore.ts` — bcrypt + `~/.hapi/passwords.json`
- `hub/src/web/routes/auth.ts` — 登录要 password；首次自动创 `moka123` + `mustChange=true`
- `POST /api/auth/change-password` — 改密
- Web `LoginPrompt.tsx` 加密码框；`ChangePasswordModal.tsx` 首次强制改密
- `settings` 页有"修改密码"入口

## 注意事项

- **只部署 MokaClaude 实例**，不碰主 `hapi.1to10.cn`。二者互不干扰。
- Web 每次部署都要**重新做品牌化 + 图标覆盖 + 改 bundle 名破缓存**，否则用户要么看到 HAPI 残留要么看到旧版本。
- 图标源文件在 `icons/`，要换图标先替换里面的 PNG/ICO/SVG。当前是"咖啡棕圆角方 + 白色 M"（#8B5A3C→#3E2620 渐变）。
- CLI 部署需要 Moka 在线（launchd 反向 SSH 隧道活着）。先 `ssh moka 'whoami'` 验证。
- Moka 上 Hub Base Token 在 `ubuntu@mokaclaude.1to10.cn:~/.hapi/settings.json`，不要误改。
- 部署前不强制 git commit；部署后可提醒。

## 故障排查

- PM2 重启失败：`ssh ubuntu@mokaclaude.1to10.cn "pm2 logs hapi-hub --lines 50 --nostream"`
- 浏览器还显示 HAPI：清 service worker + 硬刷，或检查 `assets/index-*-moka.js` 是否在 html 里被引用
- Moka runner 连不上：`ssh moka 'tail ~/.hapi/runner-launchd.log'`
