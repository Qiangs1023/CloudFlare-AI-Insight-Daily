/**
 * Notion 数据源
 * 从 Notion 数据库获取订阅源配置，抓取 RSS 内容
 */

import { fetchNotionFeeds, updateNotionFeedUrl } from '../notionClient.js';
import { getFeedUrl } from '../rssDiscovery.js';
import { fetchAndParseRss, parseRssDate } from '../rssParser.js';
import { stripHtml, formatDateToChineseWithTime, escapeHtml, sleep } from '../helpers.js';

const NotionDataSource = {
    type: 'notion',
    
    /**
     * 从 Notion 数据库获取订阅源并抓取内容
     * @param {object} env - 环境变量
     * @param {string} category - 分类过滤 (ai/tech/invest)，为空则获取全部
     * @returns {Promise<object>} 包含 items 的数据对象
     */
    async fetch(env, category = null) {
        // 从 Notion 获取所有启用的订阅源
        const feeds = await fetchNotionFeeds(env);
        
        if (!feeds || feeds.length === 0) {
            console.warn('No feeds found from Notion database');
            return { items: [] };
        }
        
        // 按分类过滤
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
        const { feedUrl, sourceType } = await getFeedUrl(feed.url, feed.feedUrl);
        
        if (!feedUrl) {
            console.warn(`Could not discover RSS feed for ${feed.name}`);
            return [];
        }
        
        // 如果之前没有 Feed URL，现在发现了，更新到 Notion
        if (!feed.feedUrl && feedUrl) {
            console.log(`Discovered new RSS feed for ${feed.name}: ${feedUrl}`);
            await updateNotionFeedUrl(env, feed.id, feedUrl);
        }
        
        // 抓取并解析 RSS
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
            type: sourceType,
            url: item.link,
            title: item.title,
            description: item.description || stripHtml(item.content || ''),
            published_date: item.pubDate || new Date().toISOString(),
            authors: item.author || 'Unknown',
            source: item.notion_feed_name || item.source || 'Unknown',
            category: item.category,
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

// 按分类导出独立的数据源
export const AINotionDataSource = {
    ...NotionDataSource,
    type: 'notion-ai',
    async fetch(env) {
        return NotionDataSource.fetch(env, 'ai');
    },
};

export const TechNotionDataSource = {
    ...NotionDataSource,
    type: 'notion-tech',
    async fetch(env) {
        return NotionDataSource.fetch(env, 'tech');
    },
};

export const InvestNotionDataSource = {
    ...NotionDataSource,
    type: 'notion-invest',
    async fetch(env) {
        return NotionDataSource.fetch(env, 'invest');
    },
};

export default NotionDataSource;
