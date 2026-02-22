/**
 * Notion 数据源
 * 从 Notion 数据库获取订阅源配置，抓取 RSS 内容
 * 
 * Notion 数据库属性：
 * - Name (title): 订阅源名称
 * - category (select): 分类（AI新闻/项目/论文/投资资讯），用于后台展示分组
 * - source (select): 来源类型（web/rss/youtube等）
 * - rssurl (url): RSS 地址（可选，系统会自动发现）
 * - url (url): 主网址
 * - t. (checkbox): 翻译
 * - d. (checkbox): 深度阅读
 * - limit (number): 限制数量（24小时内最新N条）
 */

import { fetchNotionFeeds, updateNotionFeedUrl } from '../notionClient.js';
import { getFeedUrl } from '../rssDiscovery.js';
import { fetchAndParseRss, parseRssDate } from '../rssParser.js';
import { stripHtml, formatDateToChineseWithTime, escapeHtml } from '../helpers.js';

const NotionDataSource = {
    type: 'notion',
    
    /**
     * 从 Notion 数据库获取订阅源并抓取内容
     * @param {object} env - 环境变量
     * @param {string} category - 分类过滤，为空则获取全部
     * @returns {Promise<object>} 包含 items 的数据对象
     */
    async fetch(env, category = null) {
        // 从 Notion 获取所有启用的订阅源
        const feeds = await fetchNotionFeeds(env);
        
        if (!feeds || feeds.length === 0) {
            console.warn('No feeds found from Notion database');
            return { items: [] };
        }
        
        // 按分类过滤（如果指定了分类）
        let filteredFeeds = feeds;
        if (category) {
            filteredFeeds = feeds.filter(feed => feed.category === category.toLowerCase());
        }
        
        console.log(`Fetching ${filteredFeeds.length} feeds from Notion (category: ${category || 'all'})`);
        
        const allItems = [];
        
        // 并行抓取所有订阅源
        const fetchPromises = filteredFeeds.map(feed => 
            this.fetchSingleFeed(env, feed).catch(error => {
                console.error(`Error fetching feed ${feed.name}:`, error.message);
                return [];
            })
        );
        
        const results = await Promise.allSettled(fetchPromises);
        
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
                allItems.push(...result.value);
            }
        }
        
        // 按发布日期排序
        allItems.sort((a, b) => {
            const dateA = new Date(a.published_date);
            const dateB = new Date(b.published_date);
            return dateB.getTime() - dateA.getTime();
        });
        
        return { items: allItems };
    },
    
    /**
     * 抓取单个订阅源
     * @param {object} env - 环境变量
     * @param {object} feed - 订阅源配置
     * @returns {Promise<Array>} 文章列表
     */
    async fetchSingleFeed(env, feed) {
        // 获取 RSS feed URL
        // 优先使用 feed.feedUrl (rssurl)，如果没有则尝试自动发现
        let feedUrl = feed.feedUrl;
        let sourceType = feed.source || 'rss';
        
        if (!feedUrl) {
            // 尝试根据 source 类型和 URL 自动发现 RSS
            const discovered = await getFeedUrl(feed.url, null);
            feedUrl = discovered.feedUrl;
            sourceType = discovered.sourceType || sourceType;
        }
        
        if (!feedUrl) {
            console.warn(`Could not discover RSS feed for ${feed.name} (${feed.url})`);
            return [];
        }
        
        // 如果之前没有 RSS URL，现在发现了，更新到 Notion
        if (!feed.feedUrl && feedUrl) {
            console.log(`Discovered new RSS feed for ${feed.name}: ${feedUrl}`);
            await updateNotionFeedUrl(env, feed.id, feedUrl);
        }
        
        // 抓取并解析 RSS（limit 用于限制 24 小时内最新条数）
        const items = await fetchAndParseRss(feedUrl, feed.limit);
        
        // 添加额外信息
        return items.map(item => ({
            ...item,
            source_type: sourceType,
            notion_feed_id: feed.id,
            notion_feed_name: feed.name,
            category: feed.category,
            need_translate: feed.translate,
            need_deep_read: feed.deepRead,
        }));
    },
    
    /**
     * 转换数据为统一格式
     * @param {object} rawData - 原始数据
     * @param {string} sourceType - 源类型
     * @returns {Array} 统一格式的数据
     */
    transform(rawData, sourceType) {
        if (!rawData || !rawData.items) {
            return [];
        }
        
        return rawData.items.map(item => ({
            id: item.guid || item.link,
            type: item.category || sourceType, // 使用 Notion 的 category 作为 type
            url: item.link,
            title: item.title,
            description: item.description || stripHtml(item.content || ''),
            published_date: item.pubDate || new Date().toISOString(),
            authors: item.author || 'Unknown',
            source: item.notion_feed_name || item.source || 'Unknown',
            category: item.category, // 保留 category 字段用于分组
            details: {
                content_html: item.content || '',
                need_translate: item.need_translate,
                need_deep_read: item.need_deep_read,
                source_type: item.source_type,
            },
        }));
    },
    
    /**
     * 生成 HTML 内容
     * @param {object} item - 文章项
     * @returns {string} HTML 字符串
     */
    generateHtml: (item) => {
        const categoryLabel = item.category ? `[${item.category.toUpperCase()}] ` : '';
        return `
            <strong>${escapeHtml(categoryLabel + item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source)} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">
                ${item.details.content_html || item.description || '无内容。'}
            </div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读原文</a>
        `;
    },
};

export { NotionDataSource };
export default NotionDataSource;
