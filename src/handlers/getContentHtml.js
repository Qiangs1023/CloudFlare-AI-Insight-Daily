// src/handlers/getContentHtml.js
import { getISODate, escapeHtml, setFetchDate } from '../helpers.js';
import { getFromKV } from '../kv.js';
import { generateContentSelectionPageHtml } from '../htmlGenerators.js';
import { fetchNotionFeeds } from '../notionClient.js';

export async function handleGetContentHtml(request, env) {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const dateStr = dateParam ? dateParam : getISODate();
    setFetchDate(dateStr);
    console.log(`Getting HTML content for date: ${dateStr}`);

    try {
        // Dynamically fetch categories from Notion database
        const feeds = await fetchNotionFeeds(env);
        
        // Get unique categories and convert to dataCategories format
        const categoryMap = new Map();
        for (const feed of feeds) {
            if (feed.category && !categoryMap.has(feed.category)) {
                // Use category name as both id and name (capitalize first letter for display)
                const displayName = feed.category.charAt(0).toUpperCase() + feed.category.slice(1);
                categoryMap.set(feed.category, {
                    id: feed.category,
                    name: displayName
                });
            }
        }
        
        // Add folo-list category if FOLO_LIST_ID is configured
        if (env.FOLO_LIST_ID) {
            categoryMap.set('folo-list', {
                id: 'folo-list',
                name: 'Folo List'
            });
        }
        
        const dataCategories = Array.from(categoryMap.values());
        console.log(`Found ${dataCategories.length} categories from Notion: ${dataCategories.map(c => c.id).join(', ')}`);

        // Fetch data for each category from KV
        const allData = {};
        for (const category of dataCategories) {
            allData[category.id] = await getFromKV(env.DATA_KV, `${dateStr}-${category.id}`) || [];
        }
        
        const html = generateContentSelectionPageHtml(env, dateStr, allData, dataCategories);

        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /getContentHtml:", error);
        // Ensure escapeHtml is used for error messages displayed in HTML
        return new Response(`<h1>Error generating HTML content</h1><p>${escapeHtml(error.message)}</p><pre>${escapeHtml(error.stack)}</pre>`, {
            status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}