const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

// --- CONFIGURATION ---
const BOT_TOKEN = '8940524104:AAGf7rFaKp-k12qpHqsO_KRz2ucFxKyxMLY'; 
const ADMIN_CHAT_ID = '7485181331'; 
const CHECK_INTERVAL = 30000; 
// ---------------------

const bot = new Telegraf(BOT_TOKEN);
const activeUsers = {};
const approvedUsers = new Set([ADMIN_CHAT_ID.toString()]);
const userNames = { [ADMIN_CHAT_ID.toString()]: "Admin (Aap)" };

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
};

// Render Web Server Setup
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Flipkart Bot is alive and running!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// Middleware: Access Controller
bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    const userId = ctx.from.id.toString();
    
    if (approvedUsers.has(userId) || (ctx.callbackQuery && ctx.from.id.toString() === ADMIN_CHAT_ID.toString())) {
        return next();
    }
    
    if (ctx.message && ctx.message.text === '/start') {
        const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || 'No Name';
        const username = ctx.from.username ? `@${ctx.from.username}` : 'No Username';
        
        userNames[userId] = name;
        
        ctx.reply("🔒 Access Denied! Aapka request Admin ke paas approval ke liye bhej diya gaya hai. Kripya thoda wait karein...");
        
        // Admin ko alert bhej rahe hain
        return bot.telegram.sendMessage(ADMIN_CHAT_ID, 
            `🚨 **New Flipkart Bot Request!**\n\n👤 Name: ${name}\n🆔 ID: ${userId}\n🌐 Username: ${username}`,
            Markup.inlineKeyboard([[Markup.button.callback('Approve ✅', `approve_${userId}`), Markup.button.callback('Decline ❌', `decline_${userId}`)]])
        );
    }
    return ctx.reply("❌ Aap approved nahi hain. Kripya Admin se approval lein.");
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID.toString()) return ctx.answerCbQuery("Unauthorized!");
    
    const targetUserId = data.split('_')[1];
    if (data.startsWith('approve_')) {
        approvedUsers.add(targetUserId.toString());
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ **Status: Approved!**`);
        bot.telegram.sendMessage(targetUserId, "🥳 Mubarak ho! Admin ne aapka request approve kar diya hai Flipkart tracker ke liye.\n\nProduct track karne ke liye bhejien:\n`/start_track <Flipkart_URL>`");
    } else if (data.startsWith('decline_')) {
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ **Status: Declined!**`);
        bot.telegram.sendMessage(targetUserId, "😭 Sorry! Admin ne aapka request reject kar diya hai.");
    }
    await ctx.answerCbQuery();
});

// --- ADMIN CONTROL COMMANDS ---
bot.command('list_users', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID.toString()) return ctx.reply("❌ Yeh command sirf Admin use kar sakta hai!");
    if (approvedUsers.size <= 1) return ctx.reply("👥 Abhi aapke alawa koi bhi user approved nahi hai.");
    
    let msg = "👥 **Flipkart Bot Approved Users List:**\n\n";
    let count = 1;
    approvedUsers.forEach((userId) => {
        if (userId !== ADMIN_CHAT_ID.toString()) {
            const name = userNames[userId] || "Unknown User";
            msg += `${count}. 👤 **${name}**\n🆔 ID: \`${userId}\`\n\n`;
            count++;
        }
    });
    msg += "ℹ️ Kisi ko nikaalne ke liye:\n`/remove_user <User_ID>`";
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('remove_user', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID.toString()) return ctx.reply("❌ Yeh command sirf Admin use kar sakta hai!");
    
    const args = ctx.message.text.split(' ').filter(arg => arg.trim() !== '');
    if (args.length < 2) return ctx.reply("⚠️ Format: `/remove_user <User_ID>`");
    
    const targetUserId = args[1].trim();
    if (approvedUsers.has(targetUserId)) {
        const name = userNames[targetUserId] || "User";
        approvedUsers.delete(targetUserId);
        if (activeUsers[targetUserId]) {
            activeUsers[targetUserId].forEach(item => clearInterval(item.interval));
            delete activeUsers[targetUserId];
        }
        ctx.reply(`✅ **${name}** (ID: ${targetUserId}) ko successfully remove kar diya gaya hai.`);
        bot.telegram.sendMessage(targetUserId, "🔒 Admin ne aapka access remove kar diya hai. Ab aap is bot ko use nahi kar sakte.");
    } else {
        ctx.reply("⚠️ ID approved list mein nahi mili.");
    }
});

// --- USER COMMANDS ---
bot.start((ctx) => ctx.reply("🤖 Welcome back! Flipkart Stock Tracker Bot active hai.\n\n🔹 `/start_track <Flipkart_URL>`\n🔹 `/list_track`\n🔹 `/stop_all`"));

bot.command('start_track', async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.replace(/\n/g, ' ').split(' ').filter(arg => arg.trim() !== '');
    const flipkartLink = args.find(arg => arg.includes('flipkart.com') || arg.includes('fkrt.it'));
    
    if (!flipkartLink) return ctx.reply("❌ Bhai valid Flipkart link toh bhejo!");
    if (!activeUsers[chatId]) activeUsers[chatId] = [];
    if (activeUsers[chatId].some(item => item.url === flipkartLink)) return ctx.reply("⚠️ Yeh link aap pehle se track kar rahe ho!");
    
    const intervalId = setInterval(() => { checkFlipkartStock(ctx, chatId, flipkartLink, intervalId); }, CHECK_INTERVAL);
    activeUsers[chatId].push({ url: flipkartLink, interval: intervalId });
    ctx.reply(`🚀 Flipkart link list mein add ho gaya hai! Checking chalu hai...`);
    checkFlipkartStock(ctx, chatId, flipkartLink, intervalId);
});

bot.command('list_track', (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (!activeUsers[chatId] || activeUsers[chatId].length === 0) return ctx.reply("😴 Abhi koi product track nahi ho raha hai.");
    let msg = "📋 **Active Flipkart Tracking Links:**\n\n";
    activeUsers[chatId].forEach((item, i) => { msg += `${i + 1}. ${item.url}\n\n`; });
    ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.command('stop_all', (ctx) => {
    const chatId = ctx.chat.id.toString();
    if (activeUsers[chatId] && activeUsers[chatId].length > 0) {
        activeUsers[chatId].forEach(item => clearInterval(item.interval));
        delete activeUsers[chatId];
        ctx.reply("🛑 Saari tracking band kar di gayi hai.");
    } else { ctx.reply("⚠️ Koyi active tracking nahi mili."); }
});

async function checkFlipkartStock(ctx, chatId, targetUrl, intervalId) {
    if (!activeUsers[chatId]) return;
    try {
        const response = await axios.get(targetUrl, { headers: HEADERS });
        const $ = cheerio.load(response.data);
        const pageText = $('body').text().toLowerCase();
        
        const isOutOfStock = pageText.includes('currently unavailable') || 
                             pageText.includes('this item is currently out of stock') || 
                             pageText.includes('notify me');
                             
        if (!isOutOfStock && (pageText.includes('buy now') || pageText.includes('add to cart'))) {
            await bot.telegram.sendMessage(chatId, `🚨 STOCK AAGYA 🚨\n\n🔥 bhai flipkart pr stock aagya jldi lga jake 🔥\n\nLink:\n${targetUrl}`);
            clearInterval(intervalId);
            if (activeUsers[chatId]) {
                activeUsers[chatId] = activeUsers[chatId].filter(item => item.url !== targetUrl);
            }
        }
    } catch (e) { console.error(`Flipkart Scraping error:`, e.message); }
}

bot.launch().then(() => console.log("Flipkart Bot running successfully..."));
