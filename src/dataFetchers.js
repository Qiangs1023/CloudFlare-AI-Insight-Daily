// src/dataFetchers.js
import { NotionDataSource } from './dataSources/notion.js';
import FoloListDataSource from './dataSources/foloList.js';


// All data sources are fetched from Notion database dynamically
// Categories are determined by the "Category" property in Notion
// Source type (rss/youtube/etc) is determined by the URL for feed discovery
// folo-list: special category for Folo subscription list content
export const dataSources = {
    // Dynamic sources from Notion - category is determined by Notion's Category property
    notion: { name: 'Notion', sources: [NotionDataSource] },
    // Folo List source - fetches from Folo subscription list using listId
    'folo-list': { name: 'Folo List', sources: [FoloListDataSource] },
};

/**
 * Fetches and transforms data from Notion data source.
 * @param {string} sourceType - The type of data source (should be 'notion').
 * @param {object} env - The environment variables.
 * @param {string} [foloCookie] - The Folo authentication cookie (not used for Notion sources).
 * @returns {Promise<Array<object>>} A promise that resolves to an array of unified data objects.
 */
export async function fetchAndTransformDataForType(sourceType, env, foloCookie) {
    const sources = dataSources[sourceType]?.sources;
    if (!sources || !Array.isArray(sources)) {
        console.error(`No data sources registered for type: ${sourceType}`);
        return [];
    }

    let allUnifiedDataForType = [];
    for (const dataSource of sources) {
        try {
            const rawData = await dataSource.fetch(env, foloCookie);
            const unifiedData = dataSource.transform(rawData, sourceType);
            allUnifiedDataForType = allUnifiedDataForType.concat(unifiedData);
        } catch (error) {
            console.error(`Error fetching or transforming data from source ${dataSource.type}:`, error.message);
        }
    }

    // Sort by published_date in descending order
    allUnifiedDataForType.sort((a, b) => {
        const dateA = new Date(a.published_date);
        const dateB = new Date(b.published_date);
        return dateB.getTime() - dateA.getTime();
    });

    return allUnifiedDataForType;
}

/**
 * Fetches and transforms data from Notion and Folo List, grouped by category.
 * @param {object} env - The environment variables.
 * @param {string} [foloCookie] - The Folo authentication cookie (required for folo-list).
 * @returns {Promise<object>} A promise that resolves to an object with data grouped by category.
 */
export async function fetchAllData(env, foloCookie) {
    const allUnifiedData = {};
    
    try {
        // Fetch all data from Notion
        const notionData = await fetchAndTransformDataForType('notion', env, foloCookie);
        
        // Group by category
        for (const item of notionData) {
            const category = item.category || 'uncategorized';
            if (!allUnifiedData[category]) {
                allUnifiedData[category] = [];
            }
            allUnifiedData[category].push(item);
        }
        
        // Fetch folo-list data if FOLO_LIST_ID is configured
        if (env.FOLO_LIST_ID && foloCookie) {
            try {
                const foloListData = await fetchAndTransformDataForType('folo-list', env, foloCookie);
                if (foloListData && foloListData.length > 0) {
                    allUnifiedData['folo-list'] = foloListData;
                    console.log(`Fetched ${foloListData.length} items from folo-list`);
                }
            } catch (foloError) {
                console.error('Error fetching folo-list data:', foloError.message);
            }
        }
        
        // Sort each category by published_date
        for (const category in allUnifiedData) {
            allUnifiedData[category].sort((a, b) => {
                const dateA = new Date(a.published_date);
                const dateB = new Date(b.published_date);
                return dateB.getTime() - dateA.getTime();
            });
        }
        
    } catch (error) {
        console.error('Error fetching all data:', error.message);
    }
    
    return allUnifiedData;
}

/**
 * Fetches data for a specific category from Notion or Folo List.
 * @param {object} env - The environment variables.
 * @param {string} category - The category to fetch (e.g., 'ai', 'tech', 'invest', 'folo-list').
 * @param {string} [foloCookie] - The Folo authentication cookie (required for folo-list).
 * @returns {Promise<Array<object>>} A promise that resolves to an array of data for the category.
 */
export async function fetchDataByCategory(env, category, foloCookie) {
    // Handle folo-list category separately
    if (category === 'folo-list') {
        const foloListSource = dataSources['folo-list']?.sources[0];
        if (!foloListSource) {
            console.error('Folo List data source not found');
            return [];
        }
        
        try {
            const rawData = await foloListSource.fetch(env, foloCookie);
            const unifiedData = foloListSource.transform(rawData, 'folo-list');
            
            // Sort by published_date
            unifiedData.sort((a, b) => {
                const dateA = new Date(a.published_date);
                const dateB = new Date(b.published_date);
                return dateB.getTime() - dateA.getTime();
            });
            
            return unifiedData;
        } catch (error) {
            console.error(`Error fetching data for folo-list:`, error.message);
            return [];
        }
    }
    
    // Handle Notion categories
    const notionSource = dataSources.notion.sources[0];
    
    try {
        const rawData = await notionSource.fetch(env, category);
        const unifiedData = notionSource.transform(rawData, category);
        
        // Sort by published_date
        unifiedData.sort((a, b) => {
            const dateA = new Date(a.published_date);
            const dateB = new Date(b.published_date);
            return dateB.getTime() - dateA.getTime();
        });
        
        return unifiedData;
    } catch (error) {
        console.error(`Error fetching data for category ${category}:`, error.message);
        return [];
    }
}