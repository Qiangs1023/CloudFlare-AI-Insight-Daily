/**
 * Folo List 数据源
 * 从 Folo 订阅源获取所有订阅内容
 * 使用 FOLO_LIST_ID 环境变量指定订阅列表 ID
 */
import { getRandomUserAgent, sleep, isDateWithinLastDays, stripHtml, formatDateToChineseWithTime, escapeHtml } from '../helpers.js';

const FoloListDataSource = {
    type: 'folo-list',
    
    /**
     * 从 Folo API 获取订阅列表数据
     * @param {object} env - 环境变量
     * @param {string} foloCookie - Folo 认证 Cookie
     * @returns {Promise<object>} 包含 items 的数据对象
     */
    async fetch(env, foloCookie) {
        const listId = env.FOLO_LIST_ID;
        const fetchPages = parseInt(env.FOLO_LIST_FETCH_PAGES || '5', 10);
        const allItems = [];
        const filterDays = parseInt(env.FOLO_FILTER_DAYS || '3', 10);

        if (!listId) {
            console.warn('FOLO_LIST_ID is not set in environment variables. Skipping folo list fetch.');
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "Folo List",
                home_page_url: "https://app.follow.is",
                description: "Content from Folo subscription list",
                language: "zh-cn",
                items: []
            };
        }

        if (!foloCookie) {
            console.warn('Folo Cookie is not provided. Cannot fetch folo list data.');
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "Folo List",
                home_page_url: "https://app.follow.is",
                description: "Content from Folo subscription list",
                language: "zh-cn",
                items: []
            };
        }

        let publishedAfter = null;
        for (let i = 0; i < fetchPages; i++) {
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

            if (foloCookie) {
                headers['Cookie'] = foloCookie;
            }

            const body = {
                listId: listId,
                view: 1,
                withContent: true,
            };

            if (publishedAfter) {
                body.publishedAfter = publishedAfter;
            }

            try {
                console.log(`Fetching Folo List data, page ${i + 1}... with foloCookie: present`);
                const response = await fetch(env.FOLO_DATA_API, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to fetch Folo List data, page ${i + 1}: ${response.status} ${response.statusText}`, errorText);
                    break;
                }
                
                const data = await response.json();
                
                if (data && data.data && data.data.length > 0) {
                    const filteredItems = data.data.filter(entry => isDateWithinLastDays(entry.entries.publishedAt, filterDays));
                    allItems.push(...filteredItems.map(entry => ({
                        id: entry.entries.id,
                        url: entry.entries.url,
                        title: entry.entries.title,
                        content_html: entry.entries.content,
                        date_published: entry.entries.publishedAt,
                        authors: [{ name: entry.entries.author }],
                        source: entry.feeds?.title || entry.entries.author || 'Folo',
                        feed_title: entry.feeds?.title || 'Unknown Feed',
                    })));
                    publishedAfter = data.data[data.data.length - 1].entries.publishedAt;
                } else {
                    console.log(`No more data for Folo List, page ${i + 1}.`);
                    break;
                }
            } catch (error) {
                console.error(`Error fetching Folo List data, page ${i + 1}:`, error);
                break;
            }

            // Random wait time to avoid rate limiting
            await sleep(Math.random() * 3000);
        }

        return {
            version: "https://jsonfeed.org/version/1.1",
            title: "Folo List",
            home_page_url: "https://app.follow.is",
            description: "Content from Folo subscription list",
            language: "zh-cn",
            items: allItems
        };
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
            id: item.id,
            type: 'folo-list',
            url: item.url,
            title: item.title,
            description: stripHtml(item.content_html || ""),
            published_date: item.date_published,
            authors: item.authors ? item.authors.map(author => author.name).join(', ') : 'Unknown',
            source: item.source || 'Folo List',
            category: 'folo-list',
            details: {
                content_html: item.content_html || "",
                feed_title: item.feed_title || ""
            }
        }));
    },

    /**
     * 生成 HTML 内容
     * @param {object} item - 文章项
     * @returns {string} HTML 字符串
     */
    generateHtml: (item) => {
        const feedLabel = item.details?.feed_title ? `[${item.details.feed_title}] ` : '';
        return `
            <strong>${escapeHtml(feedLabel + item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">${item.details.content_html || '无内容。'}</div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">阅读更多</a>
        `;
    }
};

export default FoloListDataSource;
