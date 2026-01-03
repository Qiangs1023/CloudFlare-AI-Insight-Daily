import { fetchRssFeed } from '../utils/rssUtils.js';
import { cleanContent } from '../utils/cleanContent.js';

// SemiAnalysis 数据源 - 专注于半导体行业深度分析
const SemiAnalysisDataSource = {
    id: 'semiAnalysis',
    name: 'SemiAnalysis',
    description: 'SemiAnalysis - 半导体行业深度分析',
    type: 'news', // 归类为新闻类型
    
    async fetch(config, foloCookie) {
        try {
            const rssUrl = config.SEMIANALYSIS_RSS_URL || 'https://semianalysis.com/feed/';
            const maxItems = parseInt(config.SEMIANALYSIS_MAX_ITEMS) || 10;
            
            console.log(`Fetching SemiAnalysis feed from: ${rssUrl}`);
            
            const items = await fetchRssFeed(rssUrl, maxItems);
            
            // 处理获取到的项目
            const processedItems = items.map((item, index) => ({
                id: `semiAnalysis-${index}-${Date.now()}`,
                title: item.title || 'Untitled',
                summary: item.description || item.summary || '',
                content: item.content || item.description || '',
                pubDate: item.pubDate || new Date().toISOString(),
                link: item.link || '',
                source: 'SemiAnalysis',
                author: item.author || 'SemiAnalysis',
                tags: item.categories || [],
            }));
            
            console.log(`Fetched ${processedItems.length} items from SemiAnalysis`);
            return processedItems;
        } catch (error) {
            console.error('Error fetching SemiAnalysis data:', error);
            throw error;
        }
    },
    
    transform(rawData, sourceType) {
        try {
            // 转换原始数据为统一格式
            const transformedItems = rawData.map((item, index) => ({
                id: `semiAnalysis-${index}-${Date.now()}`,
                title: cleanContent(item.title || 'Untitled'),
                summary: cleanContent(item.summary || item.description || ''),
                content: cleanContent(item.content || item.description || ''),
                published_date: item.pubDate || new Date().toISOString(),
                url: item.link || '',
                source: 'SemiAnalysis',
                author: item.author || 'SemiAnalysis',
                tags: item.categories || [],
                type: sourceType || 'news', // 使用传入的类型参数
            }));
            
            return transformedItems;
        } catch (error) {
            console.error('Error transforming SemiAnalysis data:', error);
            throw error;
        }
    },
    
    generateHtml(item) {
        // 注意：此方法接收单个项目，与HTML生成器的调用方式保持一致
        if (!item) {
            return '<div class="no-content">SemiAnalysis 内容为空</div>';
        }
        
        return `
            <div class="content-item" data-source="semiAnalysis" data-id="${item.id}">
                <div class="item-header">
                    <h3 class="item-title">${item.title}</h3>
                    <div class="item-meta">
                        <span class="item-date">${new Date(item.published_date).toLocaleString()}</span>
                        <a href="${item.url}" target="_blank" class="item-link">原文链接</a>
                    </div>
                </div>
                <div class="item-content">
                    <p class="item-summary">${item.summary}</p>
                </div>
            </div>
        `;
    }
};

export default SemiAnalysisDataSource;