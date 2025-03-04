# 每日食谱推荐系统

一个基于AI的每日食谱推荐系统，使用Cloudflare Workers部署，支持菜品推荐、作品展示和个人收藏等功能。

## 功能特点

- 每日AI推荐3道菜品
- 详细的烹饪步骤和食材清单
- 用户作品上传和展示
- 个人收藏和历史记录
- 用户偏好设置

## 技术栈

- 前端：HTML5 + CSS3 + JavaScript
- 后端：Cloudflare Workers + Hono
- 存储：Cloudflare KV + R2
- AI：Groq API

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
npm run dev
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

- `GROQ_API_KEY`: Groq API密钥
- `JWT_SECRET`: JWT签名密钥
- `CF_ACCOUNT_ID`: Cloudflare账户ID
- `CF_API_TOKEN`: Cloudflare API Token
- `KV_NAMESPACE_ID`: KV命名空间ID
- `R2_BUCKET_NAME`: R2存储桶名称

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