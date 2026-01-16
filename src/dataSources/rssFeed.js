import { getRandomUserAgent, sleep, isDateWithinLastDays, stripHtml, formatDateToChineseWithTime, escapeHtml } from '../helpers.js';

const RssFeedDataSource = {
    type: 'rssfeed',
    async fetch(env, foloCookie) {
        const rssUrl = env.RSS_FEED_URL;
        const filterDays = parseInt(env.FOLO_FILTER_DAYS || '7', 10);

        if (!rssUrl) {
            console.warn('RSS_FEED_URL is not set in environment variables.');
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "RSS Feed",
                home_page_url: rssUrl,
                description: "RSS Feed",
                language: "en",
                items: []
            };
        }

        try {
            console.log(`Fetching RSS feed from: ${rssUrl}`);
            const userAgent = getRandomUserAgent();
            const response = await fetch(rssUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                }
            });

            if (!response.ok) {
                console.error(`Failed to fetch RSS feed: ${response.statusText}`);
                return {
                    version: "https://jsonfeed.org/version/1.1",
                    title: "RSS Feed",
                    home_page_url: rssUrl,
                    description: "Failed to fetch RSS feed",
                    language: "en",
                    items: []
                };
            }

            const xmlText = await response.text();
            
            // Parse XML to extract items
            const items = [];
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            let match;
            
            while ((match = itemRegex.exec(xmlText)) !== null) {
                const itemXml = match[1];
                
                // Extract title
                const titleMatch = itemXml.match(/<title>(.*?)<\/title>/);
                const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') : '';
                
                // Extract link
                const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
                const url = linkMatch ? linkMatch[1] : '';
                
                // Extract description
                const descMatch = itemXml.match(/<description>(.*?)<\/description>/);
                const description = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/, '$1') : '';
                
                // Extract pubDate
                const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
                const pubDate = pubDateMatch ? pubDateMatch[1] : '';
                
                // Extract category
                const categoryMatch = itemXml.match(/<category>(.*?)<\/category>/);
                const category = categoryMatch ? categoryMatch[1] : '';
                
                // Extract guid
                const guidMatch = itemXml.match(/<guid[^>]*>(.*?)<\/guid>/);
                const guid = guidMatch ? guidMatch[1] : url;
                
                if (title && url && pubDate) {
                    items.push({
                        id: guid,
                        url: url,
                        title: title,
                        content_html: description,
                        date_published: pubDate,
                        authors: [{ name: category || 'Unknown' }],
                        source: 'RSS Feed',
                    });
                }
            }
            
            // Filter by date
            const filteredItems = items.filter(item => {
                if (!item.date_published) return false;
                const itemDate = new Date(item.date_published);
                const daysDiff = (Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
                return daysDiff <= filterDays;
            });

            console.log(`RSS feed fetched successfully. Total items: ${items.length}, Filtered items: ${filteredItems.length}`);

            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "RSS Feed",
                home_page_url: rssUrl,
                description: "RSS Feed",
                language: "en",
                items: filteredItems
            };
        } catch (error) {
            console.error(`Error fetching RSS feed:`, error);
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "RSS Feed",
                home_page_url: rssUrl,
                description: "Error fetching RSS feed",
                language: "en",
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
            source: item.source || 'RSS Feed',
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

export default RssFeedDataSource;