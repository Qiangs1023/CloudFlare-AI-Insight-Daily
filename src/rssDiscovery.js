/**
 * RSS 自动发现模块
 * 支持从 URL 自动发现 RSS feed
 * 支持 YouTube 频道转换为官方 RSS
 * 支持 RSSHub 路由自动生成
 */

import { getRandomUserAgent } from './helpers.js';

// RSSHub 公共实例列表
const RSSHUB_INSTANCES = [
    'https://rsshub.app',
    'https://rsshub.rssforever.com',
    'https://rsshub.liumingye.cn',
];

// 已知的 RSSHub 路由映射
const RSSHUB_ROUTES = {
    // GitHub
    'github.com/trending': '/github/trending/daily',
    'github.com': null, // 其他 GitHub 页面需要具体路由
    
    // Hugging Face
    'huggingface.co/papers': '/huggingface/papers',
    'huggingface.co': null,
    
    // Anthropic
    'anthropic.com/engineering': '/anthropic/engineering',
    'anthropic.com/news': '/anthropic/news',
    'www.anthropic.com/engineering': '/anthropic/engineering',
    'www.anthropic.com/news': '/anthropic/news',
    
    // OpenAI
    'openai.com/news': '/openai/news',
    'openai.com/blog': '/openai/blog',
    
    // TechCrunch
    'techcrunch.com': '/techcrunch',
    
    // Reddit
    'reddit.com': null, // 需要 subreddit 名称
    
    // Twitter/X
    'twitter.com': null, // 需要用户名
    'x.com': null,
    
    // 微信公众号
    'mp.weixin.qq.com': null, // 需要具体参数
    
    // 其他常见网站
    'medium.com': null, // 需要用户名
    'substack.com': null, // 需要具体域名
    'discord.com': null,
    'telegram.org': null,
};

/**
 * 从 URL 自动发现 RSS feed
 * @param {string} url - 原始 URL
 * @returns {Promise<string|null>} RSS feed URL 或 null
 */
export async function discoverRssFeed(url) {
    if (!url) return null;

    // 1. 检查是否是 YouTube URL
    const youtubeFeedUrl = convertYoutubeToRss(url);
    if (youtubeFeedUrl) {
        return youtubeFeedUrl;
    }

    // 2. 尝试从网站自动发现 RSS
    const websiteRss = await discoverRssFromWebsite(url);
    if (websiteRss) {
        return websiteRss;
    }

    // 3. 尝试使用 RSSHub 生成
    const rsshubFeedUrl = await tryRssHub(url);
    if (rsshubFeedUrl) {
        return rsshubFeedUrl;
    }

    return null;
}

/**
 * 尝试使用 RSSHub 生成 RSS
 * @param {string} url - 原始 URL
 * @returns {Promise<string|null>} RSS feed URL 或 null
 */
async function tryRssHub(url) {
    try {
        const urlObj = new URL(url);
        const host = urlObj.hostname.replace('www.', '');
        const path = urlObj.pathname;
        
        // 检查是否有匹配的 RSSHub 路由
        const fullPath = host + path;
        
        // 精确匹配
        if (RSSHUB_ROUTES[fullPath]) {
            return await buildRssHubUrl(RSSHUB_ROUTES[fullPath]);
        }
        
        // 前缀匹配
        for (const [key, route] of Object.entries(RSSHUB_ROUTES)) {
            if (fullPath.startsWith(key) && route) {
                return await buildRssHubUrl(route);
            }
            if (host === key && route) {
                return await buildRssHubUrl(route);
            }
        }
        
        // 尝试常见的 RSSHub 路由模式
        const commonRoutes = await guessRssHubRoute(host, path, url);
        if (commonRoutes) {
            return commonRoutes;
        }
        
        return null;
    } catch (error) {
        console.error(`Error trying RSSHub for ${url}:`, error.message);
        return null;
    }
}

/**
 * 根据网站猜测 RSSHub 路由
 */
async function guessRssHubRoute(host, path, originalUrl) {
    // 提取路径中的标识符
    const pathParts = path.split('/').filter(p => p.length > 0);
    
    // GitHub 用户/仓库
    if (host === 'github.com' && pathParts.length >= 1) {
        if (pathParts[0] === 'trending') {
            const since = pathParts[1] || 'daily';
            return await buildRssHubUrl(`/github/trending/${since}`);
        }
    }
    
    // Reddit subreddit
    if (host === 'reddit.com' || host === 'www.reddit.com') {
        if (pathParts[0] === 'r' && pathParts[1]) {
            return await buildRssHubUrl(`/reddit/subreddit/${pathParts[1]}`);
        }
    }
    
    // Twitter 用户
    if (host === 'twitter.com' || host === 'x.com') {
        if (pathParts[0] && !['search', 'home', 'explore'].includes(pathParts[0])) {
            return await buildRssHubUrl(`/twitter/user/${pathParts[0]}`);
        }
    }
    
    // Medium 用户
    if (host === 'medium.com' && pathParts[0]) {
        return await buildRssHubUrl(`/medium/user/${pathParts[0]}`);
    }
    
    return null;
}

/**
 * 构建 RSSHub URL 并验证可用性
 */
async function buildRssHubUrl(route) {
    for (const instance of RSSHUB_INSTANCES) {
        const feedUrl = `${instance}${route}`;
        try {
            const response = await fetch(feedUrl, {
                method: 'HEAD',
                headers: { 'User-Agent': getRandomUserAgent() },
            });
            
            if (response.ok) {
                console.log(`RSSHub route found: ${feedUrl}`);
                return feedUrl;
            }
        } catch {
            // 继续尝试下一个实例
        }
    }
    return null;
}

/**
 * 将 YouTube URL 转换为官方 RSS feed
 */
export function convertYoutubeToRss(url) {
    if (!url) return null;

    const patterns = [
        /youtube\.com\/channel\/([^\/\?]+)/,
        /youtube\.com\/@([^\/\?]+)/,
        /youtube\.com\/c\/([^\/\?]+)/,
        /youtube\.com\/user\/([^\/\?]+)/,
    ];

    if (!url.includes('youtube.com')) {
        return null;
    }

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            const identifier = match[1];
            
            if (identifier.startsWith('UC') && identifier.length === 24) {
                return `https://www.youtube.com/feeds/videos.xml?channel_id=${identifier}`;
            }
            
            return null;
        }
    }

    return null;
}

/**
 * 异步获取 YouTube channel_id 并返回 RSS URL
 */
export async function getYoutubeRssUrl(url) {
    if (!url || !url.includes('youtube.com')) {
        return null;
    }

    const directRss = convertYoutubeToRss(url);
    if (directRss) {
        return directRss;
    }

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': getRandomUserAgent() },
        });

        if (!response.ok) return null;

        const html = await response.text();
        
        const channelIdPatterns = [
            /"channelId":"([^"]+)"/,
            /"externalId":"([^"]+)"/,
            /channel_id=([^"&]+)/,
            /<link rel="alternate" type="application\/rss\+xml"[^>]*href="([^"]+)"/,
        ];

        for (const pattern of channelIdPatterns) {
            const match = html.match(pattern);
            if (match) {
                const value = match[1];
                
                if (value.includes('youtube.com/feeds/videos.xml')) {
                    return value;
                }
                
                if (value.startsWith('UC') && value.length === 24) {
                    return `https://www.youtube.com/feeds/videos.xml?channel_id=${value}`;
                }
            }
        }

        return null;
    } catch (error) {
        console.error(`Error getting YouTube RSS for ${url}:`, error.message);
        return null;
    }
}

/**
 * 从网站页面自动发现 RSS feed
 */
export async function discoverRssFromWebsite(url) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': getRandomUserAgent() },
        });

        if (!response.ok) return null;

        const html = await response.text();
        
        const rssPatterns = [
            /<link[^>]+type=["']application\/rss\+xml["'][^>]+href=["']([^"']+)["']/i,
            /<link[^>]+type=["']application\/atom\+xml["'][^>]+href=["']([^"']+)["']/i,
            /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/rss\+xml["']/i,
            /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/atom\+xml["']/i,
        ];

        for (const pattern of rssPatterns) {
            const match = html.match(pattern);
            if (match) {
                let feedUrl = match[1];
                
                if (feedUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    feedUrl = `${urlObj.origin}${feedUrl}`;
                } else if (!feedUrl.startsWith('http')) {
                    const urlObj = new URL(url);
                    feedUrl = `${urlObj.origin}/${feedUrl}`;
                }
                
                return feedUrl;
            }
        }

        // 尝试常见的 RSS 路径
        const urlObj = new URL(url);
        const commonPaths = ['/rss', '/feed', '/rss.xml', '/feed.xml', '/atom.xml'];
        
        for (const path of commonPaths) {
            const testUrl = `${urlObj.origin}${path}`;
            try {
                const testResponse = await fetch(testUrl, {
                    method: 'HEAD',
                    headers: { 'User-Agent': getRandomUserAgent() },
                });
                
                const contentType = testResponse.headers.get('content-type') || '';
                if (testResponse.ok && (
                    contentType.includes('xml') || 
                    contentType.includes('rss') ||
                    contentType.includes('atom')
                )) {
                    return testUrl;
                }
            } catch {
                // 忽略错误
            }
        }

        return null;
    } catch (error) {
        console.error(`Error discovering RSS from ${url}:`, error.message);
        return null;
    }
}

/**
 * 判断 URL 类型并获取对应的 RSS feed
 */
export async function getFeedUrl(url, existingFeedUrl = null) {
    if (existingFeedUrl) {
        return { feedUrl: existingFeedUrl, sourceType: 'rss' };
    }

    if (url?.includes('youtube.com')) {
        const feedUrl = await getYoutubeRssUrl(url);
        return { feedUrl, sourceType: 'youtube' };
    }

    const feedUrl = await discoverRssFeed(url);
    return { feedUrl, sourceType: feedUrl ? 'rss' : 'unknown' };
}
