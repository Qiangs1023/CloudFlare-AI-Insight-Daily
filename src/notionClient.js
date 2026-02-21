/**
 * Notion API 客户端
 * 用于从 Notion 数据库获取订阅源配置
 */

const NOTION_API_VERSION = '2022-06-28';
const NOTION_API_BASE = 'https://api.notion.com/v1';

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
                    property: 'Status',
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
        return parseNotionResults(data.results);
    } catch (error) {
        console.error('Error fetching Notion feeds:', error.message);
        return [];
    }
}

/**
 * 解析 Notion 查询结果
 * @param {Array} results - Notion API 返回的结果数组
 * @returns {Array} 标准化的订阅源列表
 */
function parseNotionResults(results) {
    return results.map(page => {
        const props = page.properties;
        
        return {
            id: page.id,
            name: getPropertyValue(props.Name || props.name, 'title'),
            url: getPropertyValue(props.URL || props.url, 'url'),
            feedUrl: getPropertyValue(props['Feed URL'] || props.feedUrl, 'url'),
            category: getPropertyValue(props.Category || props.category, 'select'),
            description: getPropertyValue(props.Description || props.description, 'rich_text'),
            translate: getPropertyValue(props.Translate || props.translate, 'checkbox'),
            deepRead: getPropertyValue(props['Deep Read'] || props.deepRead, 'checkbox'),
            limit: getPropertyValue(props.Limit || props.limit, 'number'),
        };
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
        return false;
    }

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
                    'Feed URL': {
                        url: feedUrl,
                    },
                },
            }),
        });

        return response.ok;
    } catch (error) {
        console.error(`Error updating Notion Feed URL for page ${pageId}:`, error.message);
        return false;
    }
}
