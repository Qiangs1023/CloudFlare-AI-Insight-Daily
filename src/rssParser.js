/**
 * RSS/Atom 解析器
 * 用于解析 RSS 2.0 和 Atom 格式的 feed
 */

import { getRandomUserAgent, stripHtml } from './helpers.js';

/**
 * 抓取并解析 RSS feed
 * @param {string} feedUrl - RSS feed URL
 * @param {number} limit - 限制返回的条目数量
 * @returns {Promise<Array>} 解析后的文章列表
 */
export async function fetchAndParseRss(feedUrl, limit = null) {
    if (!feedUrl) {
        return [];
    }

    try {
        const response = await fetch(feedUrl, {
            headers: {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
            },
        });

        if (!response.ok) {
            console.error(`Failed to fetch RSS feed ${feedUrl}: ${response.status}`);
            return [];
        }

        const xmlText = await response.text();
        return parseRssXml(xmlText, limit);
    } catch (error) {
        console.error(`Error fetching RSS feed ${feedUrl}:`, error.message);
        return [];
    }
}

/**
 * 解析 RSS XML 文本
 * @param {string} xmlText - XML 文本
 * @param {number} limit - 限制返回的条目数量
 * @returns {Array} 解析后的文章列表
 */
export function parseRssXml(xmlText, limit = null) {
    try {
        // 判断是 RSS 2.0 还是 Atom 格式
        if (xmlText.includes('<feed') && xmlText.includes('xmlns="http://www.w3.org/2005/Atom"')) {
            return parseAtomFeed(xmlText, limit);
        } else {
            return parseRss2Feed(xmlText, limit);
        }
    } catch (error) {
        console.error('Error parsing RSS XML:', error.message);
        return [];
    }
}

/**
 * 解析 RSS 2.0 格式
 * @param {string} xmlText - XML 文本
 * @param {number} limit - 限制条目数
 * @returns {Array} 文章列表
 */
function parseRss2Feed(xmlText, limit) {
    const items = [];
    
    // 提取 channel 信息
    const channelMatch = xmlText.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
    const channelXml = channelMatch ? channelMatch[1] : xmlText;
    
    // 提取 feed 标题
    const feedTitle = extractTagContent(channelXml, 'title') || 'RSS Feed';
    
    // 提取所有 item
    const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];
    
    const itemsToProcess = limit ? itemMatches.slice(0, limit) : itemMatches;
    
    for (const itemXml of itemsToProcess) {
        const item = {
            title: extractTagContent(itemXml, 'title'),
            link: extractTagContent(itemXml, 'link'),
            description: extractTagContent(itemXml, 'description'),
            content: extractTagContent(itemXml, 'content:encoded') || extractTagContent(itemXml, 'description'),
            pubDate: extractTagContent(itemXml, 'pubDate') || extractTagContent(itemXml, 'dc:date'),
            author: extractTagContent(itemXml, 'author') || extractTagContent(itemXml, 'dc:creator'),
            guid: extractTagContent(itemXml, 'guid'),
            source: feedTitle,
        };
        
        // 清理数据
        item.title = decodeHtmlEntities(item.title);
        item.description = stripHtml(item.description || '');
        item.content = item.content || item.description;
        
        if (item.title && item.link) {
            items.push(item);
        }
    }
    
    return items;
}

/**
 * 解析 Atom 格式
 * @param {string} xmlText - XML 文本
 * @param {number} limit - 限制条目数
 * @returns {Array} 文章列表
 */
function parseAtomFeed(xmlText, limit) {
    const items = [];
    
    // 提取 feed 标题
    const feedTitle = extractTagContent(xmlText, 'title') || 'Atom Feed';
    
    // 提取所有 entry
    const entryMatches = xmlText.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi) || [];
    
    const itemsToProcess = limit ? entryMatches.slice(0, limit) : entryMatches;
    
    for (const entryXml of itemsToProcess) {
        // Atom 的 link 标签格式不同
        const link = extractAtomLink(entryXml);
        
        const item = {
            title: extractTagContent(entryXml, 'title'),
            link: link,
            description: extractTagContent(entryXml, 'summary'),
            content: extractTagContent(entryXml, 'content') || extractTagContent(entryXml, 'summary'),
            pubDate: extractTagContent(entryXml, 'published') || extractTagContent(entryXml, 'updated'),
            author: extractAtomAuthor(entryXml),
            guid: extractTagContent(entryXml, 'id'),
            source: feedTitle,
        };
        
        // 清理数据
        item.title = decodeHtmlEntities(item.title);
        item.description = stripHtml(item.description || '');
        item.content = item.content || item.description;
        
        if (item.title && item.link) {
            items.push(item);
        }
    }
    
    return items;
}

/**
 * 提取 XML 标签内容
 * @param {string} xml - XML 文本
 * @param {string} tagName - 标签名
 * @returns {string|null} 标签内容
 */
function extractTagContent(xml, tagName) {
    // 处理 CDATA
    const cdataPattern = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
    const cdataMatch = xml.match(cdataPattern);
    if (cdataMatch) {
        return cdataMatch[1].trim();
    }
    
    // 普通标签
    const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(pattern);
    if (match) {
        return match[1].trim();
    }
    
    // 自闭合标签或属性形式 (如 <link href="..."/>)
    const attrPattern = new RegExp(`<${tagName}[^>]*href="([^"]+)"[^>]*\\/>`, 'i');
    const attrMatch = xml.match(attrPattern);
    if (attrMatch) {
        return attrMatch[1].trim();
    }
    
    return null;
}

/**
 * 提取 Atom feed 中的 link
 * @param {string} entryXml - entry XML 文本
 * @returns {string|null} link URL
 */
function extractAtomLink(entryXml) {
    // 优先查找 rel="alternate" 的 link
    const alternatePattern = /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/>/i;
    const alternateMatch = entryXml.match(alternatePattern);
    if (alternateMatch) {
        return alternateMatch[1];
    }
    
    // 查找没有 rel 属性或 rel="self" 以外的 link
    const linkPattern = /<link[^>]*href=["']([^"']+)["'][^>]*\/>/i;
    const linkMatch = entryXml.match(linkPattern);
    if (linkMatch) {
        return linkMatch[1];
    }
    
    return null;
}

/**
 * 提取 Atom feed 中的 author
 * @param {string} entryXml - entry XML 文本
 * @returns {string|null} 作者名
 */
function extractAtomAuthor(entryXml) {
    const authorPattern = /<author[^>]*>([\s\S]*?)<\/author>/i;
    const authorMatch = entryXml.match(authorPattern);
    if (authorMatch) {
        return extractTagContent(authorMatch[1], 'name');
    }
    return null;
}

/**
 * 解码 HTML 实体
 * @param {string} text - 包含 HTML 实体的文本
 * @returns {string} 解码后的文本
 */
function decodeHtmlEntities(text) {
    if (!text) return '';
    
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#x27;': "'",
        '&apos;': "'",
        '&nbsp;': ' ',
    };
    
    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
        result = result.split(entity).join(char);
    }
    
    // 解码数字实体
    result = result.replace(/&#(\d+);/g, (match, code) => String.fromCharCode(code));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => String.fromCharCode(parseInt(code, 16)));
    
    return result;
}

/**
 * 解析日期字符串为 Date 对象
 * @param {string} dateStr - 日期字符串
 * @returns {Date|null} Date 对象
 */
export function parseRssDate(dateStr) {
    if (!dateStr) return null;
    
    try {
        // ISO 8601 格式
        const isoDate = new Date(dateStr);
        if (!isNaN(isoDate.getTime())) {
            return isoDate;
        }
        
        // RFC 2822 格式 (如 "Wed, 21 Feb 2026 10:00:00 GMT")
        const rfcDate = Date.parse(dateStr);
        if (!isNaN(rfcDate)) {
            return new Date(rfcDate);
        }
        
        return null;
    } catch {
        return null;
    }
}
