# Foldframe · AI 内容创作与发布工作台

面向自媒体与内容团队的一体化本地 AI 创作与多平台发布工作台，基于开源项目 [AiToEarn](https://github.com/yikart/AiToEarn)（MIT License）深度重构，将**多模式内容创作**、**本机多模型 CLI 桥接**与**仿真手机实时排版发布**串成完整闭环。

- **在线产品展示页（Vercel）**：<https://foldframe-studio.vercel.app>
- **作者作品集介绍页**：<https://www.huangxiyuan.net/projects/foldframe>

---

## 核心特性

### 1. 内容创作（三种创作模式）
- **快捷工作台**：收拢式提示词栏支持拖拽上传参考图；「生成草稿（图文 / 视频）」直连大语言模型生成结构化文案，图片/视频走独立多模态管线，点开作品可查看右侧「生成详情」（提示词、所用模型、清晰度/比例、耗时与真实积分消耗）。
- **无限画布（Agent 节点协作）**：进入画布自动收起侧栏并水平居中排布素材；支持平滑阻尼缩放、节点间连线参考，选中节点时在下方就近弹出可编辑的提示词与参数面板，底部集成资产库与生成历史抽屉。
- **多维改图（可控二创）**：围绕中心完整原图提供「换镜头角度 / 换光影氛围 / 换背景场景 / 换画风质感 / 换穿搭造型 / 换表情动作」六个维度，内置景别、视角、光线、风格等下拉预设并支持自由修改提示词；支持参考图删除二次确认与首尾帧合成过渡视频。

### 2. AI 发布（AI 对话发布 + 排版工坊）
- **排版工坊**：入口严格隔离「图文发布」与「视频发布」；精简左侧素材编辑区为唯一「+」号（支持从本地上传或从资产库选择）；右侧提供小红书、抖音、Instagram 的笔记/封面仿真手机实时预览，手机右侧竖排比例栏整合 `3:4 / 1:1 / 4:3 / 原图` 切换、完整/铺满、自由裁剪与「比例重构（目标比例 + 调整提示词）」。
- **发布待办**：保存后的图文与视频草稿直接流转至发布待办进行多平台分发。

### 3. AI 生成素材库
- 支持按「全部 / 图片 / 视频」分类与画面比例（竖版、横版、方图及 `9:16 / 3:4 / 4:5 / 1:1 / 4:3 / 16:9`）快速筛选。
- 自动检测像素宽高并在卡片展示类型角标与比例角标，点击预览附带生成详情侧栏。

### 4. 本机多模型 CLI 桥接
- 通过 `scripts/local-bridge.mjs` 统一编排本机已登录的多模态引擎：
  - **图像 / 视频**：即梦 CLI（`dreamina-5.0` / `dreamina-5.0-pro` / `dreamina-4.5` / `Seedance 2.0 & 2.5`）、Codex 本机 `GPT Image 2`
  - **文本 / Agent**：Antigravity CLI、Codex CLI、Grok CLI（支持网页一键授权）、WorkBuddy（腾讯多模型引擎）及自定义 API 模型

---

## 目录结构

```text
.
├── project/
│   ├── aitoearn-web/        # Next.js 14 前端工作台
│   └── aitoearn-backend/    # NestJS 微服务（aitoearn-ai / aitoearn-server / libs）
├── scripts/
│   ├── compose.local.yaml   # 本地 Docker Compose 编排覆盖配置
│   └── local-bridge.mjs     # 宿主机多模型 CLI 桥接服务
├── showcase/                # 独立静态产品展示页（部署于 Vercel）
├── 启动本地版.command         # macOS 一键启动脚本
└── 本地使用说明.md            # 本地运行与模型接入指南
```

## 本地启动

详细说明见 [本地使用说明.md](./本地使用说明.md)。确保已安装 Docker Desktop 并登录本机 CLI 引擎后，可直接运行：

```bash
./启动本地版.command
```

启动完成后访问 `http://localhost:8080/zh-CN`。

## License

基于 [yikart/AiToEarn](https://github.com/yikart/AiToEarn)（MIT License）二次开发。
