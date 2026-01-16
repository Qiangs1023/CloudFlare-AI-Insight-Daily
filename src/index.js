// src/index.js
import { handleWriteData } from './handlers/writeData.js';
import { handleGetContent } from './handlers/getContent.js';
import { handleGetContentHtml } from './handlers/getContentHtml.js';
import { handleGenAIContent, handleGenAIPodcastScript, handleGenAIDailyAnalysis } from './handlers/genAIContent.js';
import { handleGenAIDailyPage } from './handlers/genAIDailyPage.js';
import { handleCommitToGitHub } from './handlers/commitToGitHub.js';
import { handleRss } from './handlers/getRss.js';
import { handleWriteRssData, handleGenerateRssContent } from './handlers/writeRssData.js';
import { dataSources, fetchAllData } from './dataFetchers.js';
import { handleLogin, isAuthenticated, handleLogout } from './auth.js';
import { storeInKV, getFromKV } from './kv.js';
import { stripHtml, removeMarkdownCodeBlock, formatMarkdownText } from './helpers.js';
import { callChatAPIStream } from './chatapi.js';
import { getSystemPromptSummarizationStepOne } from './prompt/summarizationPromptStepZero.js';
import { getSystemPromptSummarizationStepTwo } from './prompt/summarizationPromptStepTwo.js';
import { getSystemPromptSummarizationStepThree } from './prompt/summarizationPromptStepThree.js';
import { getSystemPromptPodcastFormatting } from './prompt/podcastFormattingPrompt.js';
import { getGitHubFileSha, createOrUpdateGitHubFile } from './github.js';

export default {
    async fetch(request, env) {
        // Check essential environment variables
        const requiredEnvVars = [
            'DATA_KV', 'GEMINI_API_KEY', 'GEMINI_API_URL', 'DEFAULT_GEMINI_MODEL', 'OPEN_TRANSLATE', 'USE_MODEL_PLATFORM',
            'GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME','GITHUB_BRANCH',
            'LOGIN_USERNAME', 'LOGIN_PASSWORD',
            'PODCAST_TITLE','PODCAST_BEGIN','PODCAST_END',
            'FOLO_COOKIE_KV_KEY','FOLO_DATA_API','FOLO_FILTER_DAYS',
        ];
        console.log(env);
        const missingVars = requiredEnvVars.filter(varName => !env[varName]);

        if (missingVars.length > 0) {
            console.error(`CRITICAL: Missing environment variables/bindings: ${missingVars.join(', ')}`);
            const errorPage = `
                <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Configuration Error</title></head>
                <body style="font-family: sans-serif; padding: 20px;"><h1>Server Configuration Error</h1>
                <p>Essential environment variables or bindings are missing: ${missingVars.join(', ')}. The service cannot operate.</p>
                <p>Please contact the administrator.</p></body></html>`;
            return new Response(errorPage, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        const url = new URL(request.url);
        const path = url.pathname;
        console.log(`Request received: ${request.method} ${path}`);

        // Handle login path specifically
        if (path === '/login') {
            return await handleLogin(request, env);
        } else if (path === '/logout') { // Handle logout path
            return await handleLogout(request, env);
        } else if (path === '/getContent' && request.method === 'GET') {
            return await handleGetContent(request, env);
        } else if (path.startsWith('/rss') && request.method === 'GET') {
            return await handleRss(request, env);
        } else if (path === '/writeRssData' && request.method === 'GET') {
            return await handleWriteRssData(request, env);
        } else if (path === '/generateRssContent' && request.method === 'GET') {
            return await handleGenerateRssContent(request, env);
        }

        // Authentication check for all other paths
        const { authenticated, cookie: newCookie } = await isAuthenticated(request, env);
        if (!authenticated) {
            // Redirect to login page, passing the original URL as a redirect parameter
            const loginUrl = new URL('/login', url.origin);
            loginUrl.searchParams.set('redirect', url.pathname + url.search);
            return Response.redirect(loginUrl.toString(), 302);
        }

        // Original routing logic for authenticated requests
        let response;
        try {
            if (path === '/writeData' && request.method === 'POST') {
                response = await handleWriteData(request, env);
            } else if (path === '/getContentHtml' && request.method === 'GET') {
                // Prepare dataCategories for the HTML generation
                const dataCategories = Object.keys(dataSources).map(key => ({
                    id: key,
                    name: dataSources[key].name
                }));
                response = await handleGetContentHtml(request, env, dataCategories);
            } else if (path === '/genAIContent' && request.method === 'POST') {
                response = await handleGenAIContent(request, env);
            } else if (path === '/genAIPodcastScript' && request.method === 'POST') { // New route for podcast script
                response = await handleGenAIPodcastScript(request, env);
            } else if (path === '/genAIDailyAnalysis' && request.method === 'POST') { // New route for AI Daily Analysis
                response = await handleGenAIDailyAnalysis(request, env);
            } else if (path === '/genAIDailyPage' && request.method === 'GET') { // New route for AI Daily Page
                response = await handleGenAIDailyPage(request, env);
            } else if (path === '/commitToGitHub' && request.method === 'POST') {
                response = await handleCommitToGitHub(request, env);
            } else {
                return new Response(null, { status: 404, headers: {'Content-Type': 'text/plain; charset=utf-8'} });
            }
        } catch (e) {
            console.error("Unhandled error in fetch handler:", e);
            return new Response(`Internal Server Error: ${e.message}`, { status: 500 });
        }

        // Renew cookie for authenticated requests
        if (newCookie) {
            response.headers.append('Set-Cookie', newCookie);
        }
        return response;
    },

    async scheduled(event, env, ctx) {
        // Cron 触发器处理 - 每天UTC 23:00（北京时间 07:00）自动触发
        console.log("Cron trigger activated at:", new Date().toISOString());
        
        try {
            // 1. 抓取数据
            console.log("Step 1: Fetching data from all sources...");
            await fetchAndWriteData(env);
            
            // 2. 生成 AI 内容
            console.log("Step 2: Generating AI content...");
            const aiContentResult = await generateAIContent(env);
            
            // 3. 提交到 GitHub
            console.log("Step 3: Committing to GitHub...");
            await commitToGitHub(env, aiContentResult);
            
            console.log("Cron task completed successfully at:", new Date().toISOString());
        } catch (error) {
            console.error("Cron task failed:", error);
            // 可以在这里添加错误通知逻辑
        }
    }
};

// ========================
// 自动化任务辅助函数
// ========================

/**
 * 自动化数据抓取
 */
async function fetchAndWriteData(env) {
    const dateStr = new Date().toISOString().split('T')[0];
    console.log(`Fetching data for date: ${dateStr}`);
    
    const foloCookie = env.FOLO_COOKIE_KV_KEY || null;
    const allUnifiedData = await fetchAllData(env, foloCookie);
    
    const storePromises = [];
    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            const data = allUnifiedData[sourceType] || [];
            storePromises.push(storeInKV(env.DATA_KV, `${dateStr}-${sourceType}`, data));
            console.log(`Fetched ${sourceType}: ${data.length} items`);
        }
    }
    
    await Promise.allSettled(storePromises);
    console.log("Data fetching completed");
}

/**
 * 自动化 AI 内容生成
 */
async function generateAIContent(env) {
    const dateStr = new Date().toISOString().split('T')[0];
    console.log(`Generating AI content for date: ${dateStr}`);
    
    // 获取所有数据
    const allFetchedData = {};
    const fetchPromises = [];
    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            fetchPromises.push(
                getFromKV(env.DATA_KV, `${dateStr}-${sourceType}`).then(data => {
                    allFetchedData[sourceType] = data || [];
                })
            );
        }
    }
    await Promise.allSettled(fetchPromises);
    
    // 收集所有数据项
    const selectedContentItems = [];
    for (const sourceType in dataSources) {
        if (Object.hasOwnProperty.call(dataSources, sourceType)) {
            const items = allFetchedData[sourceType] || [];
            for (const item of items) {
                let itemText = "";
                switch (item.type) {
                    case 'news':
                        itemText = `News Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nContent Summary: ${stripHtml(item.details.content_html)}`;
                        break;
                    case 'project':
                        itemText = `Project Name: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nDescription: ${item.description}\nStars: ${item.details.totalStars}`;
                        break;
                    case 'paper':
                        itemText = `Papers Title: ${item.title}\nPublished: ${item.published_date}\nUrl: ${item.url}\nAbstract/Content Summary: ${stripHtml(item.details.content_html)}`;
                        break;
                    case 'socialMedia':
                        itemText = `socialMedia Post by ${item.authors}：Published: ${item.published_date}\nUrl: ${item.url}\nContent: ${stripHtml(item.details.content_html)}`;
                        break;
                    default:
                        itemText = `Type: ${item.type}\nTitle: ${item.title || 'N/A'}\nDescription: ${item.description || 'N/A'}\nURL: ${item.url || 'N/A'}`;
                        if (item.published_date) itemText += `\nPublished: ${item.published_date}`;
                        if (item.source) itemText += `\nSource: ${item.source}`;
                        if (item.details && item.details.content_html) itemText += `\nContent: ${stripHtml(item.details.content_html)}`;
                        break;
                }
                if (itemText) {
                    selectedContentItems.push(itemText);
                }
            }
        }
    }
    
    console.log(`Total items to process: ${selectedContentItems.length}`);
    
    // 生成 AI 摘要
    const fullPromptForCall1_System = getSystemPromptSummarizationStepOne();
    const chunkSize = 5;
    const summaryPromises = [];
    
    for (let i = 0; i < selectedContentItems.length; i += chunkSize) {
        const chunk = selectedContentItems.slice(i, i + chunkSize);
        const chunkPrompt = chunk.join('\n\n---\n\n');
        
        summaryPromises.push((async () => {
            let summarizedChunks = [];
            for await (const streamChunk of callChatAPIStream(env, chunkPrompt, fullPromptForCall1_System)) {
                summarizedChunks.push(streamChunk);
            }
            return summarizedChunks.join('');
        })());
    }
    
    const summaries = await Promise.all(summaryPromises);
    const summarizedContent = summaries.join('\n\n---\n\n');
    
    // 第二轮摘要
    const fullPromptForCall2_System = getSystemPromptSummarizationStepTwo();
    let finalSummaryChunks = [];
    for await (const chunk of callChatAPIStream(env, summarizedContent, fullPromptForCall2_System)) {
        finalSummaryChunks.push(chunk);
    }
    const finalSummary = finalSummaryChunks.join('');
    
    // 第三轮摘要
    const fullPromptForCall3_System = getSystemPromptSummarizationStepThree();
    let finalFinalSummaryChunks = [];
    for await (const chunk of callChatAPIStream(env, finalSummary, fullPromptForCall3_System)) {
        finalFinalSummaryChunks.push(chunk);
    }
    const finalFinalSummary = removeMarkdownCodeBlock(finalFinalSummaryChunks.join(''));
    
    // 生成播客脚本
    const podcastSystemPrompt = getSystemPromptPodcastFormatting(env);
    let podcastChunks = [];
    for await (const chunk of callChatAPIStream(env, finalFinalSummary, podcastSystemPrompt)) {
        podcastChunks.push(chunk);
    }
    const podcastScript = removeMarkdownCodeBlock(podcastChunks.join(''));
    
    console.log("AI content generation completed");
    
    return {
        date: dateStr,
        dailySummary: finalFinalSummary,
        podcastScript: podcastScript
    };
}

/**
 * 自动化 GitHub 提交
 */
async function commitToGitHub(env, aiContentResult) {
    const { date, dailySummary, podcastScript } = aiContentResult;
    console.log(`Committing to GitHub for date: ${date}`);
    
    const filesToCommit = [];
    
    if (dailySummary) {
        filesToCommit.push({ 
            path: `daily/${date}.md`, 
            content: formatMarkdownText(dailySummary), 
            description: "Daily Summary File" 
        });
    }
    
    if (podcastScript) {
        filesToCommit.push({ 
            path: `podcast/${date}.md`, 
            content: podcastScript, 
            description: "Podcast Script File" 
        });
    }
    
    for (const file of filesToCommit) {
        try {
            const existingSha = await getGitHubFileSha(env, file.path);
            const commitMessage = `${existingSha ? 'Update' : 'Create'} ${file.description.toLowerCase()} for ${date}`;
            await createOrUpdateGitHubFile(env, file.path, file.content, commitMessage, existingSha);
            console.log(`GitHub commit success for ${file.path}`);
        } catch (err) {
            console.error(`Failed to commit ${file.path} to GitHub:`, err);
        }
    }
    
    console.log("GitHub commit completed");
}
