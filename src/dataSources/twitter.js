// 引入辅助函数：用于模拟浏览器、控制请求节奏、日期过滤、HTML 处理等
import { 
  getRandomUserAgent,           // 随机生成 User-Agent，避免被反爬
  sleep,                       // 暂停函数，用于在请求之间等待
  isDateWithinLastDays,        // 判断日期是否在最近 N 天内
  stripHtml,                   // 去除 HTML 标签，用于生成纯文本摘要
  formatDateToChineseWithTime, // 将 ISO 时间格式化为中文可读时间（如“2025年4月5日 14:30”）
  escapeHtml                   // 转义 HTML 特殊字符，防止 XSS 攻击
} from '../helpers';

// Twitter 数据源模块：负责从 Folo 服务拉取 Twitter 列表内容
const TwitterDataSource = {
  /**
   * 从 Folo API 抓取 Twitter 列表中的推文数据
   * @param {Object} env - Cloudflare Workers 的环境变量对象
   * @param {string} foloCookie - 用于身份验证的 Cookie（如访问私有列表）
   * @returns {Object} 符合 JSON Feed 1.1 规范的结构化数据
   */
  async fetch(env, foloCookie) {
    // 从环境变量中读取 Twitter 列表 ID（必须设置）
    const listId = env.TWITTER_LIST_ID;
    // 要抓取多少页数据（默认 3 页）
    const fetchPages = parseInt(env.TWITTER_FETCH_PAGES || '3', 10);
    // 存放所有符合条件的推文
    const allTwitterItems = [];
    // 只保留最近 N 天的推文（默认 3 天）
    const filterDays = parseInt(env.FOLO_FILTER_DAYS || '3', 10);

    // 如果未设置列表 ID，返回空的 JSON Feed（但仍符合规范）
    if (!listId) {
      console.error('TWITTER_LIST_ID is not set in environment variables.');
      return {
        version: "https://jsonfeed.org/version/1.1",
        title: "Twitter Feeds",
        home_page_url: "https://x.com/",
        description: "Aggregated Twitter feeds from various users",
        language: "zh-cn",
        items: []
      };
    }

    // 用于分页：记录上一批最后一条推文的发布时间，作为下一批的起始时间
    let publishedAfter = null;

    // 循环抓取多页数据
    for (let i = 0; i < fetchPages; i++) {
      // 模拟真实浏览器请求头（伪装成 Folo Web App 的移动端访问）
      const userAgent = getRandomUserAgent();
      const headers = {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        'accept': 'application/json',
        'accept-language': 'zh-CN,zh;q=0.9',
        'baggage': 'sentry-environment=stable,sentry-release=5251fa921ef6cbb6df0ac4271c41c2b4a0ce7c50,sentry-public_key=e5bccf7428aa4e881ed5cb713fdff181,sentry-trace_id=2da50ca5ad944cb794670097d876ada8,sentry-sampled=true,sentry-sample_rand=0.06211835167903246,sentry-sample_rate=1',
        'origin': 'https://app.follow.is',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
        'sec-ch-ua-mobile': '?1',
        'sec-ch-ua-platform': '"Android"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'x-app-name': 'Folo Web',
        'x-app-version': '0.4.9',
      };

      // 如果传入了 Cookie，添加到请求头（用于身份验证）
      if (foloCookie) {
        headers['Cookie'] = foloCookie;
      }

      // 构造请求体
      const body = {
        listId: listId,       // 要抓取的 Twitter 列表 ID
        view: 1,              // 视图类型（Folo 内部定义）
        withContent: true,    // 请求包含完整内容
      };

      // 如果不是第一页，添加 publishedAfter 实现时间分页
      if (publishedAfter) {
        body.publishedAfter = publishedAfter;
      }

      try {
        console.log(`Fetching Twitter data, page ${i + 1}...`);
        // 向 Folo API 发起 POST 请求
        const response = await fetch(env.FOLO_DATA_API, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body),
        });

        // 如果响应失败，打印错误并跳出循环
        if (!response.ok) {
          console.error(`Failed to fetch Twitter data, page ${i + 1}: ${response.statusText}`);
          break;
        }

        // 解析返回的 JSON 数据
        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
          // 过滤：只保留最近 N 天内的推文
          const filteredItems = data.data.filter(entry => 
            isDateWithinLastDays(entry.entries.publishedAt, filterDays)
          );

          // 将每条推文转换为 JSON Feed 兼容的格式
          allTwitterItems.push(...filteredIs.map(entry => ({
            id: entry.entries.id,                              // 唯一 ID
            url: entry.entries.url,                            // 推文链接
            title: entry.entries.title,                        // 标题（可能为空）
            content_html: entry.entries.content,               // 推文 HTML 内容
            date_published: entry.entries.publishedAt,         // 发布时间（ISO 格式）
            authors: [{ name: entry.entries.author }],         // 作者
            // 标识来源：如果是 Twitter 列表，用 `twitter-用户名`；否则保留原始 feed 标题
            source: entry.feeds.title && entry.feeds.title.startsWith('Twitter') 
              ? `twitter-${entry.entries.author}` 
              : `${entry.feeds.title} - ${entry.entries.author}`,
          })));

          // 更新 publishedAfter：取最后一条推文的时间，用于下一页请求
          publishedAfter = data.data[data.data.length - 1].entries.publishedAt;
        } else {
          // 无更多数据，提前结束分页
          console.log(`No more data for Twitter, page ${i + 1}.`);
          break;
        }
      } catch (error) {
        // 捕获网络或解析错误
        console.error(`Error fetching Twitter data, page ${i + 1}:`, error);
        break;
      }

      // 随机等待 0~5 秒，避免触发 Folo 的速率限制
      await sleep(Math.random() * 5000);
    }

    // 返回符合 JSON Feed 1.1 规范的格式（用于后续生成网页、邮件等）
    return {
      version: "https://jsonfeed.org/version/1.1",
      title: "Twitter Feeds",
      home_page_url: "https://x.com/",
      description: "Aggregated Twitter feeds from various users",
      language: "zh-cn",
      items: allTwitterItems
    };
  },

  /**
   * 将原始 JSON Feed 数据转换为项目内部统一的数据结构
   * @param {Object} rawData - 来自 fetch 的原始数据
   * @param {string} sourceType - 数据源类型（如 "twitter"）
   * @returns {Array} 标准化后的条目数组
   */
  transform(rawData, sourceType) {
    // 安全检查：如果数据无效，返回空数组
    if (!rawData || !rawData.items) {
      return [];
    }

    return rawData.items.map(item => ({
      id: item.id,
      type: sourceType,                                  // 标记来源类型
      url: item.url,
      title: item.title,
      description: stripHtml(item.content_html || ""),   // 纯文本摘要
      published_date: item.date_published,               // 原始发布时间
      authors: item.authors 
        ? item.authors.map(author => author.name).join(', ')  // 合并作者名为字符串
        : 'Unknown',
      source: item.source || 'twitter',                  // 保留来源标识
      details: {
        content_html: item.content_html || ""            // 保留原始 HTML 内容
      }
    }));
  },

  /**
   * 为单条推文生成 HTML 片段（用于网页展示）
   * @param {Object} item - 标准化后的条目
   * @returns {string} HTML 字符串
   */
  generateHtml: (item) => {
    return `
      <strong>${escapeHtml(item.title)}</strong><br>
      <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
      <div class="content-html">
        ${item.details.content_html || '无内容。'}
      </div>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">查看推文</a>
    `;
  }
};

// 导出模块，供其他文件使用
export default TwitterDataSource;
