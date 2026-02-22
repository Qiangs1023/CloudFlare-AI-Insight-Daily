// src/handlers/writeData.js
import { getISODate, getFetchDate } from '../helpers.js';
import { fetchAllData, fetchDataByCategory } from '../dataFetchers.js';
import { storeInKV } from '../kv.js';
import { fetchNotionFeeds } from '../notionClient.js';

export async function handleWriteData(request, env) {
    const dateParam = getFetchDate();
    const dateStr = dateParam ? dateParam : getISODate();
    console.log(`Starting /writeData process for date: ${dateStr}`);
    let category = null;
    let foloCookie = null;
    
    try {
        // 尝试解析请求体，获取 category 参数
        if (request.headers.get('Content-Type')?.includes('application/json')) {
            const requestBody = await request.json();
            category = requestBody.category;
            foloCookie = requestBody.foloCookie;
        }

        // 如果前端没传 foloCookie，则从环境变量获取
        if (!foloCookie && env.FOLO_COOKIE) {
            foloCookie = env.FOLO_COOKIE;
            console.log('Using FOLO_COOKIE from environment variables');
        }

        console.log(`Starting /writeData process for category: ${category || 'all'}`);

        let dataToStore = {};
        let fetchPromises = [];
        let successMessage = '';

        if (category) {
            // 只抓取指定分类的数据
            const fetchedData = await fetchDataByCategory(env, category, foloCookie);
            dataToStore[category] = fetchedData;
            fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${category}`, fetchedData));
            successMessage = `Data for category '${category}' fetched and stored.`;
            console.log(`Transformed ${category}: ${fetchedData.length} items.`);
        } else {
            // 抓取所有分类的数据（按 Notion 数据库中的 Category 属性分组）
            const allData = await fetchAllData(env, foloCookie);
            
            for (const cat in allData) {
                if (Object.hasOwnProperty.call(allData, cat)) {
                    dataToStore[cat] = allData[cat] || [];
                    fetchPromises.push(storeInKV(env.DATA_KV, `${dateStr}-${cat}`, dataToStore[cat]));
                    console.log(`Transformed ${cat}: ${dataToStore[cat].length} items.`);
                }
            }
            successMessage = `All categories fetched and stored.`;
        }

        await Promise.all(fetchPromises);

        const errors = [];

        if (errors.length > 0) {
            console.warn("/writeData completed with errors:", errors);
            return new Response(JSON.stringify({ 
                success: false, 
                message: `${successMessage} Some errors occurred.`, 
                errors: errors, 
                ...Object.fromEntries(Object.entries(dataToStore).map(([key, value]) => [`${key}ItemCount`, value.length]))
            }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        } else {
            console.log("/writeData process completed successfully.");
            return new Response(JSON.stringify({ 
                success: true, 
                message: successMessage,
                categories: Object.keys(dataToStore),
                ...Object.fromEntries(Object.entries(dataToStore).map(([key, value]) => [`${key}ItemCount`, value.length]))
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (error) {
        console.error("Unhandled error in /writeData:", error);
        return new Response(JSON.stringify({ success: false, message: "An unhandled error occurred during data processing.", error: error.message, details: error.stack }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}