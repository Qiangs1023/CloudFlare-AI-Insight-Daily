// src/dataSources/elonMusk.js
import { getRandomUserAgent, sleep, isDateWithinLastDays, stripHtml, formatDateToChineseWithTime, escapeHtml } from '../helpers.js';

const ElonMuskDataSource = {
    type: 'elon-musk',
    async fetch(env, foloCookie) {
        const feedId = env.ELONMUSK_FEED_ID;
        const filterDays = parseInt(env.FOLO_FILTER_DAYS || '7', 10);

        if (!feedId) {
            console.warn('ELONMUSK_FEED_ID is not set in environment variables. Skipping Elon Musk feed fetch.');
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "Elon Musk Feeds",
                home_page_url: "https://twitter.com/elonmusk",
                description: "Aggregated Elon Musk feeds from Twitter and other sources",
                language: "zh-cn",
                items: []
            };
        }

        try {
            console.log(`Fetching Elon Musk data from share link...`);
            // 使用 Folo 分享链接 API,不需要认证
            const shareUrl = `https://app.folo.is/share/feeds/${feedId}?view=1`;
            const response = await fetch(shareUrl);

            if (!response.ok) {
                console.error(`Failed to fetch Elon Musk data: ${response.statusText}`);
                return {
                    version: "https://jsonfeed.org/version/1.1",
                    title: "Elon Musk Feeds",
                    home_page_url: "https://twitter.com/elonmusk",
                    description: "Aggregated Elon Musk feeds from Twitter and other sources",
                    language: "zh-cn",
                    items: []
                };
            }

            const html = await response.text();
            
            // 从 HTML 中提取 JSON 数据
            const jsonMatch = html.match(/window\.__HYDRATE__\["feeds\.\$get,query:id=\d+"\]=JSON\.parse\('(.+?)'\)/);
            
            if (!jsonMatch || !jsonMatch[1]) {
                console.error('Failed to extract JSON data from share link');
                return {
                    version: "https://jsonfeed.org/version/1.1",
                    title: "Elon Musk Feeds",
                    home_page_url: "https://twitter.com/elonmusk",
                    description: "Aggregated Elon Musk feeds from Twitter and other sources",
                    language: "zh-cn",
                    items: []
                };
            }

            // 解析 JSON 数据
            const jsonData = JSON.parse(jsonMatch[1]);
            const entries = jsonData.entries || [];

            // 过滤最近 N 天的内容
            const filteredEntries = entries.filter(entry => 
                isDateWithinLastDays(entry.publishedAt, filterDays)
            );

            // 转换为统一格式
            const items = filteredEntries.map(entry => ({
                id: entry.id,
                url: entry.url,
                title: entry.title || entry.description?.substring(0, 100) || '无标题',
                content_html: entry.content || entry.description || '',
                date_published: entry.publishedAt,
                authors: [{ name: entry.author || 'Elon Musk' }],
                source: 'Elon Musk',
            }));

            console.log(`Successfully fetched ${items.length} Elon Musk entries`);

            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "Elon Musk Feeds",
                home_page_url: "https://twitter.com/elonmusk",
                description: "Aggregated Elon Musk feeds from Twitter and other sources",
                language: "zh-cn",
                items: items
            };

        } catch (error) {
            console.error(`Error fetching Elon Musk data:`, error);
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "Elon Musk Feeds",
                home_page_url: "https://twitter.com/elonmusk",
                description: "Aggregated Elon Musk feeds from Twitter and other sources",
                language: "zh-cn",
                items: []
            };
        }
    },

    transform(rawData, sourceType) {
        if (!rawData || !rawData.items) {
            return [];
        }

        return rawData.items.map(item => ({
            id: item.id,
            type: sourceType,
            url: item.url,
            title: item.title,
            description: stripHtml(item.content_html || ""),
            published_date: item.date_published,
            authors: item.authors ? item.authors.map(author => author.name).join(', ') : 'Unknown',
            source: item.source || 'Elon Musk',
            details: {
                content_html: item.content_html || ""
            }
        }));
    },

    generateHtml: (item) => {
        return `
            <strong>${escapeHtml(item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">${item.details.content_html || '无内容。'}</div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读更多</a>
        `;
    }
};

export default ElonMuskDataSource;