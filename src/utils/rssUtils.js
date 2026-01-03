/**
 * RSS 工具函数
 */

/**
 * 从 RSS URL 获取并解析内容
 * @param {string} rssUrl - RSS 源 URL
 * @param {number} maxItems - 最大获取项目数
 * @returns {Promise<Array>} 解析后的 RSS 项目数组
 */
export async function fetchRssFeed(rssUrl, maxItems = 10) {
    try {
        // 在 Cloudflare Workers 环境中使用 fetch 获取 RSS
        const response = await fetch(rssUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
        }
        
        const rssText = await response.text();
        
        // 简单的 RSS 解析器 - 使用 DOMParser 解析 XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(rssText, 'text/xml');
        
        // 获取所有 item 元素
        const items = xmlDoc.querySelectorAll('item');
        const results = [];
        
        // 限制获取的项目数量
        const itemsToProcess = items.length > maxItems ? items.slice(0, maxItems) : items;
        
        for (const item of itemsToProcess) {
            const titleElement = item.querySelector('title');
            const descriptionElement = item.querySelector('description');
            const pubDateElement = item.querySelector('pubDate');
            const linkElement = item.querySelector('link');
            const authorElement = item.querySelector('author') || item.querySelector('dc\\:creator, creator');
            const contentElement = item.querySelector('content\\:encoded') || item.querySelector('encoded');
            
            const rssItem = {
                title: titleElement ? titleElement.textContent : '',
                description: descriptionElement ? descriptionElement.textContent : '',
                pubDate: pubDateElement ? pubDateElement.textContent : new Date().toISOString(),
                link: linkElement ? linkElement.textContent : '',
                author: authorElement ? authorElement.textContent : '',
                content: contentElement ? contentElement.textContent : '',
                categories: []
            };
            
            // 获取分类信息
            const categoryElements = item.querySelectorAll('category');
            if (categoryElements.length > 0) {
                rssItem.categories = Array.from(categoryElements).map(cat => cat.textContent);
            }
            
            results.push(rssItem);
        }
        
        return results;
    } catch (error) {
        console.error('Error parsing RSS feed:', error);
        throw error;
    }
}

/**
 * 从 Atom 格式获取内容
 * @param {string} atomUrl - Atom 源 URL
 * @param {number} maxItems - 最大获取项目数
 * @returns {Promise<Array>} 解析后的 Atom 项目数组
 */
export async function fetchAtomFeed(atomUrl, maxItems = 10) {
    try {
        const response = await fetch(atomUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch Atom feed: ${response.status} ${response.statusText}`);
        }
        
        const atomText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(atomText, 'text/xml');
        
        const entries = xmlDoc.querySelectorAll('entry');
        const results = [];
        
        const entriesToProcess = entries.length > maxItems ? entries.slice(0, maxItems) : entries;
        
        for (const entry of entriesToProcess) {
            const titleElement = entry.querySelector('title');
            const summaryElement = entry.querySelector('summary');
            const updatedElement = entry.querySelector('updated');
            const linkElement = entry.querySelector('link');
            const authorElement = entry.querySelector('author name');
            
            const atomItem = {
                title: titleElement ? titleElement.textContent : '',
                summary: summaryElement ? summaryElement.textContent : '',
                pubDate: updatedElement ? updatedElement.textContent : new Date().toISOString(),
                link: linkElement ? linkElement.getAttribute('href') : '',
                author: authorElement ? authorElement.textContent : '',
                content: '',
            };
            
            // 获取内容
            const contentElement = entry.querySelector('content');
            if (contentElement) {
                atomItem.content = contentElement.textContent;
            }
            
            results.push(atomItem);
        }
        
        return results;
    } catch (error) {
        console.error('Error parsing Atom feed:', error);
        throw error;
    }
}