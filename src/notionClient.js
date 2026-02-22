/**
 * Notion API 客户端
 * 用于从 Notion 数据库获取订阅源配置
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
            title: null,
            url: null,
            feedUrl: null,
            category: null,
            status: null,
            description: null,
            translate: null,
            deepRead: null,
            limit: null,
        };

        for (const [name, prop] of Object.entries(properties)) {
            const lowerName = name.toLowerCase();
            
            // 根据属性名和类型推断用途
            if (prop.type === 'title') {
                mapping.title = name;
            } else if (prop.type === 'url') {
                if (lowerName.includes('feed') || lowerName.includes('rss')) {
                    mapping.feedUrl = name;
                } else {
                    mapping.url = name;
                }
            } else if (prop.type === 'select') {
                if (lowerName.includes('category') || lowerName.includes('分类')) {
                    mapping.category = name;
                }
            } else if (prop.type === 'checkbox') {
                if (lowerName.includes('status') || lowerName.includes('启用') || lowerName.includes('状态')) {
                    mapping.status = name;
                } else if (lowerName.includes('translate') || lowerName.includes('翻译')) {
                    mapping.translate = name;
                } else if (lowerName.includes('deep') || lowerName.includes('深度')) {
                    mapping.deepRead = name;
                }
            } else if (prop.type === 'rich_text') {
                if (lowerName.includes('desc') || lowerName.includes('描述')) {
                    mapping.description = name;
                }
            } else if (prop.type === 'number') {
                if (lowerName.includes('limit') || lowerName.includes('限制')) {
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
    const statusPropName = propNames.status || 'Status';

    try {
        const response = await fetch(`${NOTION_API_BASE}/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': NOTION_API_VERSION,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filter: {
                    property: statusPropName,
                    checkbox: {
                        equals: true,
                    },
                },
                page_size: 100,
            }),
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
            feedUrl: getPropertyValue(props[propNames.feedUrl], 'url'),
            category: getPropertyValue(props[propNames.category], 'select'),
            description: getPropertyValue(props[propNames.description], 'rich_text'),
            translate: getPropertyValue(props[propNames.translate], 'checkbox'),
            deepRead: getPropertyValue(props[propNames.deepRead], 'checkbox'),
            limit: getPropertyValue(props[propNames.limit], 'number'),
        };
        
        console.log(`Parsed feed: ${feed.name}, URL: ${feed.url}, FeedURL: ${feed.feedUrl || '(empty)'}, Category: ${feed.category}`);
        
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
 * 更新 Notion 页面的 Feed URL 字段
 * @param {object} env - 环境变量对象
 * @param {string} pageId - Notion 页面 ID
 * @param {string} feedUrl - 要更新的 Feed URL
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
    const feedUrlPropName = propNames.feedUrl;

    if (!feedUrlPropName) {
        console.error('updateNotionFeedUrl: Could not find Feed URL property name');
        return false;
    }

    console.log(`Updating Notion Feed URL for page ${pageId}: ${feedUrl} (property: ${feedUrlPropName})`);

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
                    [feedUrlPropName]: {
                        url: feedUrl,
                    },
                },
            }),
        });

        if (response.ok) {
            console.log(`Successfully updated Feed URL for page ${pageId}`);
        } else {
            const errorText = await response.text();
            console.error(`Failed to update Feed URL: ${response.status} - ${errorText}`);
        }

        return response.ok;
    } catch (error) {
        console.error(`Error updating Notion Feed URL for page ${pageId}:`, error.message);
        return false;
    }
}

/**
 * 清除属性名缓存（用于测试）
 */
export function clearPropertyNameCache() {
    propertyNamesCache = null;
}
