/**
 * Notion API 客户端
 * 用于从 Notion 数据库获取订阅源配置
 * 
 * Notion 数据库属性映射：
 * - Name (title): 订阅源名称
 * - category (select): 分类（AI新闻/项目/论文/投资资讯）
 * - source (select): 来源类型
 * - rssurl (url): RSS 地址
 * - url (url): 主网址
 * - t. (checkbox): 翻译
 * - d. (checkbox): 深度阅读
 * - limit (number): 限制数量
 */

const NOTION_API_VERSION = '2022-06-28';
const NOTION_API_BASE = 'https://api.notion.com/v1';

// 缓存数据库属性名映射
let propertyNamesCache = null;

/**
 * 获取 Notion 数据库的属性结构
 * @param {object} env - 环境变量对象
 * @returns {Promise<object>} 属性名映射
 */
async function getDatabaseProperties(env) {
    if (propertyNamesCache) {
        return propertyNamesCache;
    }

    const databaseId = env.NOTION_DATABASE_ID;
    const apiKey = env.NOTION_API_KEY;

    if (!databaseId || !apiKey) {
        return {};
    }

    try {
        const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': NOTION_API_VERSION,
            },
        });

        if (!response.ok) {
            console.error(`Failed to get database properties: ${response.status}`);
            return {};
        }

        const data = await response.json();
        const properties = data.properties || {};
        
        // 构建属性名映射（根据类型推断用途）
        const mapping = {
            title: null,       // Name
            url: null,         // 主网址
            rssurl: null,      // RSS 地址
            category: null,    // 分类
            source: null,      // 来源类型
            status: null,      // 启用状态
            translate: null,   // 翻译
            deepRead: null,    // 深度阅读
            limit: null,       // 限制数量
        };

        for (const [name, prop] of Object.entries(properties)) {
            const lowerName = name.toLowerCase();
            
            if (prop.type === 'title') {
                mapping.title = name;
            } else if (prop.type === 'url') {
                // 根据 Notion 属性名区分 url 和 rssurl
                if (lowerName.includes('rss') || lowerName === 'rssurl') {
                    mapping.rssurl = name;
                } else {
                    mapping.url = name;
                }
            } else if (prop.type === 'select') {
                if (lowerName.includes('category') || lowerName === 'category') {
                    mapping.category = name;
                } else if (lowerName.includes('source') || lowerName === 'source') {
                    mapping.source = name;
                }
            } else if (prop.type === 'checkbox') {
                // 匹配 t. (翻译) 和 d. (深度阅读)，以及其他常见命名
                if (lowerName === 't.' || lowerName.includes('translate') || lowerName.includes('翻译')) {
                    mapping.translate = name;
                } else if (lowerName === 'd.' || lowerName.includes('deep') || lowerName.includes('深度')) {
                    mapping.deepRead = name;
                } else if (lowerName.includes('status') || lowerName.includes('启用') || lowerName.includes('状态')) {
                    mapping.status = name;
                }
            } else if (prop.type === 'number') {
                if (lowerName.includes('limit') || lowerName === 'limit' || lowerName.includes('限制')) {
                    mapping.limit = name;
                }
            }
        }

        console.log('Database property mapping:', JSON.stringify(mapping));
        propertyNamesCache = mapping;
        return mapping;
    } catch (error) {
        console.error('Error getting database properties:', error.message);
        return {};
    }
}

/**
 * 从 Notion 数据库查询订阅源
 * @param {object} env - 环境变量对象
 * @returns {Promise<Array>} 订阅源列表
 */
export async function fetchNotionFeeds(env) {
    const databaseId = env.NOTION_DATABASE_ID;
    const apiKey = env.NOTION_API_KEY;

    if (!databaseId || !apiKey) {
        console.error('Notion configuration missing: NOTION_DATABASE_ID or NOTION_API_KEY');
        return [];
    }

    // 获取属性名映射
    const propNames = await getDatabaseProperties(env);
    
    // 使用找到的 status 属性名，如果没找到就尝试常见的名称
    const statusPropName = propNames.status || 'Status';

    try {
        // 构建 filter，如果 status 属性存在则使用
        const requestBody = {
            page_size: 100,
        };
        
        // 尝试使用 checkbox 类型的 status 属性过滤
        if (propNames.status) {
            requestBody.filter = {
                property: statusPropName,
                checkbox: {
                    equals: true,
                },
            };
        }

        const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': NOTION_API_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Notion API error: ${response.status} - ${errorText}`);
            return [];
        }

        const data = await response.json();
        return parseNotionResults(data.results, propNames);
    } catch (error) {
        console.error('Error fetching Notion feeds:', error.message);
        return [];
    }
}

/**
 * 解析 Notion 查询结果
 * @param {Array} results - Notion API 返回的结果数组
 * @param {object} propNames - 属性名映射
 * @returns {Array} 标准化的订阅源列表
 */
function parseNotionResults(results, propNames) {
    return results.map(page => {
        const props = page.properties;
        
        const feed = {
            id: page.id,
            name: getPropertyValue(props[propNames.title], 'title'),
            url: getPropertyValue(props[propNames.url], 'url'),
            feedUrl: getPropertyValue(props[propNames.rssurl], 'url'),  // rssurl 作为 feedUrl
            category: getPropertyValue(props[propNames.category], 'select'),
            source: getPropertyValue(props[propNames.source], 'select'),  // source 类型
            translate: getPropertyValue(props[propNames.translate], 'checkbox'),
            deepRead: getPropertyValue(props[propNames.deepRead], 'checkbox'),
            limit: getPropertyValue(props[propNames.limit], 'number'),
        };
        
        console.log(`Parsed feed: ${feed.name}, URL: ${feed.url}, FeedURL: ${feed.feedUrl || '(empty)'}, Category: ${feed.category}, Source: ${feed.source}`);
        
        return feed;
    }).filter(feed => feed.url); // 只保留有 URL 的订阅源
}

/**
 * 获取属性值
 * @param {object} prop - Notion 属性对象
 * @param {string} type - 属性类型
 * @returns {*} 属性值
 */
function getPropertyValue(prop, type) {
    if (!prop) return null;

    switch (type) {
        case 'title':
            return prop.title?.[0]?.plain_text || null;
        case 'url':
            return prop.url || null;
        case 'select':
            return prop.select?.name?.toLowerCase() || null;
        case 'rich_text':
            return prop.rich_text?.[0]?.plain_text || null;
        case 'checkbox':
            return prop.checkbox || false;
        case 'number':
            return prop.number || null;
        default:
            return null;
    }
}

/**
 * 更新 Notion 页面的 RSS URL 字段
 * @param {object} env - 环境变量对象
 * @param {string} pageId - Notion 页面 ID
 * @param {string} feedUrl - 要更新的 RSS URL
 * @returns {Promise<boolean>} 是否更新成功
 */
export async function updateNotionFeedUrl(env, pageId, feedUrl) {
    const apiKey = env.NOTION_API_KEY;

    if (!apiKey || !pageId || !feedUrl) {
        console.error('updateNotionFeedUrl: Missing required parameters');
        return false;
    }

    // 获取正确的属性名
    const propNames = await getDatabaseProperties(env);
    const rssurlPropName = propNames.rssurl;

    if (!rssurlPropName) {
        console.error('updateNotionFeedUrl: Could not find RSS URL property name');
        return false;
    }

    console.log(`Updating Notion RSS URL for page ${pageId}: ${feedUrl} (property: ${rssurlPropName})`);

    try {
        const response = await fetch(`${NOTION_API_BASE}/pages/${pageId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': NOTION_API_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                properties: {
                    [rssurlPropName]: {
                        url: feedUrl,
                    },
                },
            }),
        });

        if (response.ok) {
            console.log(`Successfully updated RSS URL for page ${pageId}`);
        } else {
            const errorText = await response.text();
            console.error(`Failed to update RSS URL: ${response.status} - ${errorText}`);
        }

        return response.ok;
    } catch (error) {
        console.error(`Error updating Notion RSS URL for page ${pageId}:`, error.message);
        return false;
    }
}

/**
 * 清除属性名缓存（用于测试）
 */
export function clearPropertyNameCache() {
    propertyNamesCache = null;
}