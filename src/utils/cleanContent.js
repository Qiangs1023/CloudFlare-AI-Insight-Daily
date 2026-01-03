/**
 * 内容清理工具函数
 */

/**
 * 清理内容中的 HTML 标签和其他不需要的字符
 * @param {string} content - 需要清理的内容
 * @returns {string} 清理后的内容
 */
export function cleanContent(content) {
    if (!content || typeof content !== 'string') {
        return '';
    }
    
    // 移除 HTML 标签
    let cleaned = content.replace(/<[^>]*>/g, '');
    
    // 解码 HTML 实体
    cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&nbsp;/g, ' ');
    
    // 移除多余的空白字符
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
}

/**
 * 截取指定长度的内容
 * @param {string} content - 原始内容
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 截取后添加的后缀
 * @returns {string} 截取后的内容
 */
export function truncateContent(content, maxLength = 200, suffix = '...') {
    if (!content || typeof content !== 'string') {
        return '';
    }
    
    if (content.length <= maxLength) {
        return content;
    }
    
    return content.substring(0, maxLength) + suffix;
}

/**
 * 移除内容中的敏感或不适当词汇
 * @param {string} content - 原始内容
 * @param {Array<string>} sensitiveWords - 敏感词列表
 * @returns {string} 过滤后的内容
 */
export function filterSensitiveWords(content, sensitiveWords = []) {
    if (!content || typeof content !== 'string' || !Array.isArray(sensitiveWords)) {
        return content;
    }
    
    let filtered = content;
    for (const word of sensitiveWords) {
        const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        filtered = filtered.replace(regex, '***');
    }
    
    return filtered;
}