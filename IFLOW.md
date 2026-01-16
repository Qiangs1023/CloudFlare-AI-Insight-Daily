# CloudFlare-AI-Insight-Daily 项目上下文

## 项目概述

这是一个基于 **Cloudflare Workers** 的 AI 资讯日报生成平台,每日自动聚合 AI 领域的动态(新闻、论文、GitHub 热门项目、社交媒体内容、科技媒体文章),并通过 Google Gemini/OpenAI 兼容 API 进行智能摘要和分析,最终生成日报和播客脚本发布到 GitHub Pages。

### 核心技术栈
- **运行环境**: Cloudflare Workers (Serverless)
- **存储**: Cloudflare KV
- **AI 模型**: Google Gemini / OpenAI 兼容 API (如 DeepSeek)
- **前端**: mdBook (静态站点生成器)
- **自动化**: GitHub Actions + Docker
- **语言**: JavaScript (ES Modules)

### 项目架构
```
src/
├── index.js              # 主入口,路由处理
├── dataFetchers.js       # 数据源聚合器
├── chatapi.js            # AI API 调用封装 (Gemini/OpenAI)
├── auth.js               # 认证模块
├── kv.js                 # KV 存储操作
├── htmlGenerators.js     # HTML 生成
├── helpers.js            # 工具函数
├── marked.esm.js         # Markdown 解析器
├── github.js             # GitHub API 操作
├── appUrl.js             # 应用 URL 配置
├── ad.js                 # 广告配置
├── foot.js               # 页脚配置
├── dataSources/          # 数据源实现
│   ├── newsAggregator.js # 新闻聚合 (支持多个 listId)
│   ├── elonMusk.js       # Kylist/Elon Musk (使用分享链接,无需 Cookie)
│   ├── github-trending.js # GitHub 热门项目
│   ├── huggingface-papers.js # Huggingface 论文 (支持 AI 翻译)
│   ├── papers.js         # 论文
│   ├── twitter.js        # Twitter
│   ├── reddit.js         # Reddit
│   ├── aibase.js         # AI Base
│   ├── jiqizhixin.js     # 机器之心
│   ├── xiaohu.js         # 小虎 AI
│   ├── qbit.js           # 量子位
│   └── xinzhiyuan.js     # 新智元
├── handlers/             # 请求处理器
│   ├── writeData.js      # 写入数据
│   ├── getContent.js     # 获取内容
│   ├── getContentHtml.js # 生成 HTML
│   ├── genAIContent.js   # AI 内容生成 (包括播客脚本、日报分析)
│   ├── genAIDailyPage.js # AI 日报页面
│   ├── commitToGitHub.js # 提交到 GitHub
│   ├── getRss.js         # RSS 生成
│   └── writeRssData.js   # 写入 RSS 数据
└── prompt/               # AI Prompt 模板
    ├── summarizationPromptStepZero.js   # 摘要步骤 0
    ├── summarizationPromptStepOne.js    # 摘要步骤 1
    ├── summarizationPromptStepTwo.js    # 摘要步骤 2
    ├── summarizationPromptStepThree.js  # 摘要步骤 3
    ├── summarizationSimplifyPrompt.js   # 简化摘要
    ├── dailyAnalysisPrompt.js           # 日报分析
    └── podcastFormattingPrompt.js       # 播客脚本格式化
```

## 核心配置

### wrangler.toml 配置
项目的主要配置在 `wrangler.toml` 中:

```toml
# Worker 配置
name = "ai-daily"
main = "src/index.js"
compatibility_date = "2025-05-20"
workers_dev = true

# KV 命名空间
kv_namespaces = [
  { binding = "DATA_KV", id = "71cf4115e49c4bda8fc52c7f6fda3e78" }
]

[vars]
# 图片代理
IMG_PROXY = ""  # 图片代理链接,用于处理图片不显示

# 翻译配置
OPEN_TRANSLATE = "true"  # 是否开启 AI 翻译 (如论文标题翻译)

# AI 模型配置
USE_MODEL_PLATFORM = "GEMINI"  # 或 "OPEN"
GEMINI_API_KEY = "xxxxxx"
GEMINI_API_URL = "https://api-proxy.me/gemini"  # 网上公共的代理 API
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-preview-05-20"
OPENAI_API_KEY = "sk-xxxxxx"
OPENAI_API_URL = "https://api.deepseek.com"  # 或您的 OpenAI 兼容 API URL
DEFAULT_OPEN_MODEL = "deepseek-chat"

# GitHub 发布配置
GITHUB_TOKEN = "github_pat_xxxxxx"
GITHUB_REPO_OWNER = "Qiang1023"
GITHUB_REPO_NAME = "CloudFlare-AI-Insight-Daily"
GITHUB_BRANCH = "main"

# Folo 数据源配置
FOLO_COOKIE_KV_KEY = "_ga_DZMBZBW3EC=..."  # Folo 认证 Cookie (存储在 KV 中)
FOLO_DATA_API = "https://api.follow.is/entries"
FOLO_FILTER_DAYS = 7  # 过滤最近 N 天的内容

# 新闻聚合器配置 (支持多个 listId,用逗号分隔)
NEWS_AGGREGATOR_LIST_ID = "158437828119024640"
NEWS_AGGREGATOR_FETCH_PAGES = "1"

# Kylist/Elon Musk 配置 (使用分享链接,无需 Cookie)
KYLIST_LIST_ID = "226452067576373248"
KYLIST_FETCH_PAGES = "1"

# Huggingface 论文配置
HGPAPERS_LIST_ID = "158437917409783808"
HGPAPERS_FETCH_PAGES = "1"

# Twitter 配置
TWITTER_LIST_ID = "153028784690326528"
TWITTER_FETCH_PAGES = "1"

# Reddit 配置
REDDIT_LIST_ID = "167576006499975168"
REDDIT_FETCH_PAGES = "1"

# GitHub Trending 配置
PROJECTS_API_URL = "https://git-trending.justlikemaki.vip/topone/?since=daily"

# 认证配置
LOGIN_USERNAME = "root"
LOGIN_PASSWORD = "toor"

# 日报标题配置
DAILY_TITLE = "AI洞察日报"
DAILY_TITLE_MIN = " `AI 日报` "

# 播客配置
PODCAST_TITLE = "来生小酒馆"
PODCAST_BEGIN = "嘿,亲爱的V,欢迎收听新一期的来生情报站,我是你们的老朋友,何夕2077"
PODCAST_END = "今天的情报就到这里,注意隐蔽,赶紧撤离"

# 其他配置
BOOK_LINK = ""  # mdBook 链接
INSERT_FOOT = "false"  # 是否插入页脚
INSERT_AD = "false"  # 是否插入广告
INSERT_APP_URL = "<h3>[查看完整版AI日报↗️ https://ai.hubtoday.app/](https://ai.hubtoday.app/)</h3>"  # 应用 URL
```

## 构建和运行

### 本地开发
```bash
# 安装依赖
npm install -g wrangler

# 启动本地开发服务器
wrangler dev
```

### 部署到 Cloudflare
```bash
# 登录 Cloudflare
wrangler login

# 部署
wrangler deploy
```

### Docker 构建 (用于 GitHub Actions)
项目使用 Docker 容器来构建 mdBook,相关配置在 `cron-docker/` 目录:

```bash
# 构建 Docker 镜像
cd cron-docker
docker build -t ai-daily-builder .

# 运行构建脚本
docker run --rm -v $(pwd):/workspace ai-daily-builder bash -c "cd /workspace && ./scripts/build.sh"
```

### 主要 API 路由
- `GET /login` - 登录页面
- `GET /logout` - 登出
- `GET /getContent` - 获取内容 (需要认证)
- `GET /getContentHtml` - 获取内容 HTML (需要认证)
- `POST /writeData` - 写入数据 (需要认证)
- `POST /genAIContent` - 生成 AI 内容摘要 (需要认证)
- `POST /genAIPodcastScript` - 生成播客脚本 (需要认证)
- `POST /genAIDailyAnalysis` - 生成 AI 日报分析 (需要认证)
- `GET /genAIDailyPage` - 生成 AI 日报页面 (需要认证)
- `POST /commitToGitHub` - 提交到 GitHub (需要认证)
- `GET /rss` - RSS 订阅
- `GET /writeRssData` - 写入 RSS 数据
- `GET /generateRssContent` - 生成 RSS 内容

## 开发约定

### 代码风格
- 使用 ES Modules (import/export)
- 异步操作使用 async/await
- 错误处理使用 try-catch
- 函数和变量使用 camelCase 命名

### 数据源架构
项目采用模块化的数据源架构,每个数据源都是一个独立的模块,包含以下方法:

1. **fetch(env, foloCookie)** - 获取原始数据
   - `env`: 环境变量
   - `foloCookie`: Folo 认证 Cookie (可选,某些数据源如 Kylist 使用分享链接无需 Cookie)
   - 返回: JSON Feed 格式的数据

2. **transform(rawData, sourceType)** - 转换为统一格式
   - `rawData`: 原始数据
   - `sourceType`: 数据源类型
   - 返回: 统一格式对象数组

3. **generateHtml(item)** - 生成 HTML 展示
   - `item`: 单个数据项
   - 返回: HTML 字符串

### 数据源分类
在 `src/dataFetchers.js` 中,数据源按类型分组:

```javascript
export const dataSources = {
    news: { name: '新闻', sources: [NewsAggregatorDataSource, KylistDataSource] },
    project: { name: '项目', sources: [GithubTrendingDataSource] },
    paper: { name: '论文', sources: [PapersDataSource] },
    socialMedia: { name: '社交平台', sources: [TwitterDataSource, RedditDataSource] },
};
```

### 添加新数据源
添加新数据源需要:
1. 在 `src/dataSources/` 创建新文件
2. 导出包含 `fetch()`, `transform()`, `generateHtml()` 方法的对象
3. 在 `src/dataFetchers.js` 中注册数据源到相应类型

### AI Prompt 管理
所有 AI Prompt 模板存放在 `src/prompt/` 目录,通过导入使用。项目采用多步骤摘要生成策略:
- **Step 0**: 初始预处理
- **Step 1**: 第一轮摘要
- **Step 2**: 第二轮摘要
- **Step 3**: 最终摘要
- **Simplify**: 简化摘要
- **Daily Analysis**: 日报分析
- **Podcast Formatting**: 播客脚本格式化

### 认证机制
- 使用基于 Cookie 的会话认证
- 所有敏感路由需要认证 (除 `/login`, `/logout`, `/rss` 相关路由)
- 认证状态存储在 KV 中
- Cookie 会自动续期

### 数据过滤
- 所有数据源都支持基于时间过滤 (`FOLO_FILTER_DAYS`)
- 数据按 `published_date` 降序排列
- 支持多页抓取 (通过 `*_FETCH_PAGES` 配置)

## 自动化流程

### GitHub Actions
项目使用 GitHub Actions 实现自动化:
- `.github/workflows/build-daily-book.yml` - 每日自动构建日报 (使用 Docker)
- `.github/workflows/deploy-workers.yml` - 部署 Workers
- `.github/workflows/unzip_and_commit.yml` - 解压并提交

### 定时任务
默认在 UTC 时间 23:00 (北京时间 07:00) 触发日报构建。

### Docker 构建流程
1. 克隆仓库到 Docker 容器
2. 下载 mdBook 二进制文件
3. 执行 `scripts/build.sh` 构建日报
4. 生成静态站点文件
5. 提交到 GitHub Pages 分支

## 重要注意事项

1. **环境变量**: 所有敏感信息 (API Key、Token) 都通过 `wrangler.toml` 或 Cloudflare 环境变量配置
2. **Folo Cookie**: 
   - 需要从浏览器获取 Folo Cookie 并存储到 KV 中
   - 部分数据源 (如 Kylist/Elon Musk) 使用分享链接,无需 Cookie
   - Cookie 存储在 KV 的 `FOLO_COOKIE_KV_KEY` 键中
3. **KV 命名空间**: 必须在 Cloudflare 控制台创建 KV 命名空间并配置 ID
4. **GitHub Token**: 需要具有 `repo` 权限的 Personal Access Token
5. **分支管理**: 默认使用 `main` 分支,可根据需要调整
6. **图片代理**: 如果图片无法显示,可配置 `IMG_PROXY` 来代理图片请求
7. **AI 翻译**: `OPEN_TRANSLATE` 控制是否开启 AI 翻译功能 (如论文标题翻译)

## 数据流

```
用户选择内容 → 写入 KV → AI 生成摘要 (多步骤) → 生成 HTML → 提交到 GitHub → GitHub Actions (Docker 构建) → 发布到 GitHub Pages
```

## 扩展性

项目设计为高度可扩展:
- **添加新数据源**: 只需实现 `fetch()`, `transform()`, `generateHtml()` 方法
- **切换 AI 模型**: 通过 `USE_MODEL_PLATFORM` 配置
- **自定义内容格式**: 修改 `src/prompt/` 中的模板
- **添加新功能**: 在 `src/handlers/` 中添加处理器
- **支持多数据源**: 同一类型可配置多个数据源 (如新闻可配置多个 listId)

## 特殊功能

### Kylist/Elon Musk 数据源
- 使用 Folo 分享链接 API,无需认证 Cookie
- 支持从 HTML 中提取 JSON 数据
- 自动过滤最近 N 天的内容

### Huggingface 论文数据源
- 支持 AI 翻译论文标题为中文
- 使用批量翻译以提高效率
- 翻译结果存储在 `title_zh` 字段

### 新闻聚合器
- 支持多个 listId,用逗号分隔
- 支持多页抓取
- 自动去重和过滤

### GitHub Actions + Docker
- 使用 Docker 容器隔离构建环境
- 自动下载 mdBook 二进制文件
- 支持跨平台构建

## 故障排除

### 常见问题

1. **数据源无法获取数据**
   - 检查 `FOLO_COOKIE_KV_KEY` 是否正确配置
   - 检查 `FOLO_FILTER_DAYS` 是否设置合理
   - 查看控制台日志获取详细错误信息

2. **AI 生成失败**
   - 检查 `GEMINI_API_KEY` 或 `OPENAI_API_KEY` 是否正确
   - 检查 API URL 是否可访问
   - 检查模型名称是否正确

3. **GitHub 提交失败**
   - 检查 `GITHUB_TOKEN` 是否有足够的权限
   - 检查 `GITHUB_REPO_OWNER` 和 `GITHUB_REPO_NAME` 是否正确
   - 检查分支名称是否正确

4. **图片无法显示**
   - 配置 `IMG_PROXY` 来代理图片请求
   - 检查图片 URL 是否可访问

## 相关文档

- [部署指南](docs/DEPLOYMENT.md)
- [扩展指南](docs/EXTENDING.md)
- [README](README.md)
- [Elon Musk 数据源设置](ELONMUSK_SETUP.md)