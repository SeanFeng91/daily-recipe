# 每日食谱推荐系统

一个基于AI的每日食谱推荐系统，使用Cloudflare Workers部署，支持菜品推荐、作品展示和个人收藏等功能。

## 功能特点

- 每日AI推荐菜品，包含详细的烹饪步骤和食材清单
- AI自动生成菜品图片，展示效果更直观
- 历史推荐记录查看，支持日历导航
- 用户作品上传和展示
- 个人收藏和历史记录
- 用户偏好设置
- 响应式设计，支持多设备访问

## 技术栈

- 前端：HTML5 + CSS3 + JavaScript
  - TailwindCSS - 样式框架
  - Marked.js - Markdown渲染
  - PrismJS - 代码高亮
- 后端：Cloudflare Workers + Hono
- 存储：Cloudflare KV + R2
- AI服务：
  - Groq API - 菜谱生成
  - Silicon Flow API - 图片生成

## 本地开发

1. 克隆项目
```bash
git clone https://github.com/your-username/daily-recipe.git
cd daily-recipe
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
复制`.env.example`文件为`.env`，并填入相应的配置：
```bash
cp .env.example .env
```

4. 启动开发服务器
```bash
# 启动 Workers 开发服务器
npm run dev

# 启动前端开发服务器（在另一个终端）
cd public && http-server -p 3000 --cors
```

## 部署

1. 配置Cloudflare
- 创建Worker
- 创建KV命名空间
- 创建R2存储桶
- 设置环境变量

2. 部署项目
```bash
npm run deploy
```

## 环境变量

项目需要以下环境变量：

- `GROQ_API_KEY`: Groq API密钥，用于生成菜谱推荐
- `SILICONFLOW_API_KEY`: Silicon Flow API密钥，用于生成菜品图片
- `JWT_SECRET`: JWT签名密钥，用于用户认证
- `CF_ACCOUNT_ID`: Cloudflare账户ID
- `CF_API_TOKEN`: Cloudflare API Token
- `KV_NAMESPACE_ID`: KV命名空间ID，用于存储推荐历史
- `R2_BUCKET_NAME`: R2存储桶名称，用于存储用户上传的图片

## 目录结构

```
/
├── src/
│   └── worker.js          # Worker主文件
├── public/
│   ├── index.html         # 首页
│   ├── recipe-detail.html # 食谱详情页
│   ├── gallery.html       # 作品展示页
│   ├── profile.html       # 个人中心页
│   ├── history.html       # 历史记录页
│   ├── js/
│   │   ├── api.js        # API交互层
│   │   └── main.js       # 主要逻辑
│   └── css/              # 样式文件
├── package.json
└── wrangler.toml         # Cloudflare配置
```

## 许可证

MIT 