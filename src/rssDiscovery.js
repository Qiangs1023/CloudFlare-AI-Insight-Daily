/**
 * RSS 自动发现模块
 * 支持从 URL 自动发现 RSS feed
 * 支持 YouTube 频道转换为官方 RSS
 */

import { getRandomUserAgent } from './helpers.js';

/**
 * 从 URL 自动发现 RSS feed
 * @param {string} url - 原始 URL
 * @returns {Promise<string|null>} RSS feed URL 或 null
 */
export async function discoverRssFeed(url) {
    if (!url) return null;

    // 检查是否是 YouTube URL
    const youtubeFeedUrl = convertYoutubeToRss(url);
    if (youtubeFeedUrl) {
        return youtubeFeedUrl;
    }

    // 对于其他 URL，尝试自动发现 RSS
    return await discoverRssFromWebsite(url);
}

/**
 * 将 YouTube URL 转换为官方 RSS feed
 * @param {string} url - YouTube URL
 * @returns {string|null} RSS feed URL 或 null
 */
export function convertYoutubeToRss(url) {
    if (!url) return null;

    // 匹配各种 YouTube URL 格式
    const patterns = [
        // youtube.com/channel/UCxxx
        /youtube\.com\/channel\/([^\/\?]+)/,
        // youtube.com/@username
        /youtube\.com\/@([^\/\?]+)/,
        // youtube.com/c/name
        /youtube\.com\/c\/([^\/\?]+)/,
        // youtube.com/user/name
        /youtube\.com\/user\/([^\/\?]+)/,
    ];

    // 检查是否是 YouTube URL
    if (!url.includes('youtube.com')) {
        return null;
    }

    // 对于 @username 和 /c/name 格式，需要先获取 channel_id
    // 这里我们尝试直接提取，对于需要转换的情况返回特殊标记
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            const identifier = match[1];
            
            // 如果是 channel_id 格式 (以 UC 开头)
            if (identifier.startsWith('UC') && identifier.length === 24) {
                return `https://www.youtube.com/feeds/videos.xml?channel_id=${identifier}`;
            }
            
            // 对于其他格式，需要异步获取 channel_id
            // 返回一个 Promise 来处理
            return null; // 稍后在异步函数中处理
        }
    }

    return null;
}

/**
 * 异步获取 YouTube channel_id 并返回 RSS URL
 * @param {string} url - YouTube URL
 * @returns {Promise<string|null>} RSS feed URL 或 null
 */
export async function getYoutubeRssUrl(url) {
    if (!url || !url.includes('youtube.com')) {
        return null;
    }

    // 首先尝试直接转换
    const directRss = convertYoutubeToRss(url);
    if (directRss) {
        return directRss;
    }

    // 对于需要转换的格式，尝试从页面获取 channel_id
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
            },
        });

        if (!response.ok) return null;

        const html = await response.text();
        
        // 尝试从页面中提取 channel_id
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
                
                // 如果匹配到的是完整的 RSS URL
                if (value.includes('youtube.com/feeds/videos.xml')) {
                    return value;
                }
                
                // 如果是 channel_id
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
 * @param {string} url - 网站 URL
 * @returns {Promise<string|null>} RSS feed URL 或 null
 */
export async function discoverRssFromWebsite(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': getRandomUserAgent(),
            },
        });

        if (!response.ok) return null;

        const html = await response.text();
        
        // 查找 RSS/Atom link 标签
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
                
                // 处理相对路径
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
                // 忽略错误，继续尝试下一个路径
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
 * @param {string} url - 原始 URL
 * @param {string} existingFeedUrl - 已存在的 Feed URL（如果有）
 * @returns {Promise<{feedUrl: string|null, sourceType: string}>} RSS feed URL 和源类型
 */
export async function getFeedUrl(url, existingFeedUrl = null) {
    // 如果已有 Feed URL，直接返回
    if (existingFeedUrl) {
        return { feedUrl: existingFeedUrl, sourceType: 'rss' };
    }

    // 判断 URL 类型
    if (url.includes('youtube.com')) {
        const feedUrl = await getYoutubeRssUrl(url);
        return { feedUrl, sourceType: 'youtube' };
    }

    // 对于其他网站，尝试发现 RSS
    const feedUrl = await discoverRssFeed(url);
    return { feedUrl, sourceType: feedUrl ? 'rss' : 'unknown' };
}
