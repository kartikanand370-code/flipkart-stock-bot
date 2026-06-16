const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');

// --- CONFIGURATION ---
const BOT_TOKEN = '8940524104:AAGf7rFaKp-k12qpHqsO_KRz2ucFxKyxMLY'; 
const ADMIN_CHAT_ID = '7485181331'; // Aapki Shaktishali Admin ID locked hai
const CHECK_INTERVAL = 10000; // 10 Seconds
// ---------------------

const bot = new Telegraf(BOT_TOKEN);
const activeUsers = {};

// Runtime safe list (Isme aap hamesha pehle se approved rahoge)
global.approvedList = global.approvedList || [ADMIN_CHAT_ID.toString()];
const userNames = { [ADMIN_CHAT_ID.toString()]: "Admin (Aap)" };

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Flipkart Guarded Bot Server is Live!'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// Inline buttons dashboard handles
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id.toString();
    
    // Stop tracking button validation (Sabhi approved users chala sakte hain khud ka)
    if (data.startsWith('stop_url_')) {
        const index = parseInt(data.split('_')[2]);
        const chatId = ctx.chat.id.toString();
        
        if (activeUsers[chatId] && activeUsers[chatId][index]) {
            const removedItem = activeUsers[chatId][index];
            clearInterval(removedItem.interval);
            activeUsers[chatId].splice(index, 1);
            await ctx.answerCbQuery("Tracking band kar di gayi hai! 🛑");
            return ctx.reply(`🛑 Tracking stopped for:\n${removedItem.url}`, { disable_web_page_preview: true });
        } else {
            return ctx.answerCbQuery("⚠️ Already stopped.");
        }
    }

    // 🔒 BUTTON SECURITY: Button daba kar bhi aapke alawa koi approve nahi kar sakta!
    if (userId !== ADMIN_CHAT_ID.toString()) return ctx.answerCbQuery("❌ Unauthorized! Aap admin nahi hain.");
    
    const targetUserId = data.split('_')[1];
    if (data.startsWith('approve_')) {
        if (!global.approvedList.includes(targetUserId.toString())) {
            global.approvedList.push(targetUserId.toString());
        }
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ **Status: Approved!**`);
        bot.telegram.sendMessage(targetUserId, "🥳 Mubarak ho! Admin ne aapka request approve kar diya hai Flipkart tracker ke liye.\n\nProduct track karne ke liye bhejien:\n`/start_track <Flipkart_URL>`");
    } else if (data.startsWith('decline_')) {
        await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ **Status: Declined!**`);
    }
    await ctx.answerCbQuery();
});

// --- PUBLIC WELCOME & AUTO REQUEST ON START ---
bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || 'No Name';
    
    if (global.approvedList.includes(userId)) {
        return ctx.reply("🤖 Welcome back! Flipkart Stock Tracker Bot active hai.\n\n🔹 `/start_track <Flipkart_URL>`\n🔹 `/list_track`\n🔹 `/stop_all`");
    }
    
    // Non-approved user ko block message dikhega bina loop banaye
    ctx.reply(`🔒 **Access Denied!**\n\nAap abhi approved nahi hain.\nAapki Telegram ID: \`${userId}\`\n\nAdmin ko apni ID bhejien approval ke liye.`);
    
    // Admin (Aapko) alert bhejega manual command link ke sath
    bot.telegram.sendMessage(ADMIN_CHAT_ID, 
        `🚨 **New Flipkart Bot Request!**\n\n👤 Name: ${name}\n🆔 ID: \`${userId}\`\n\n👉 Approve karne ke liye yeh copy karke send karein:\n\`/approve ${userId}\``,
        Markup.inlineKeyboard([[Markup.button.callback('Approve ✅', `approve_${userId}`), Markup.button.callback('Decline ❌', `decline_${userId}`)]])
    );
});

// ─── 🔒 STRICT ADMIN CONTROLS (LOCKED DOWN) ───

bot.command('approve', (ctx) => {
    // SECURITY CHECK: Agar message bhejnewala Admin nahi hai, toh yahin rok do!
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID.toString()) {
        return ctx.reply("❌ Bhai chalaki nahi! Yeh command sirf Admin (Owner) hi chala sakta hai.");
    }
    
    const args = ctx.message.text.split(' ').filter(arg => arg.trim() !== '');
    if (args.length < 2) return ctx.reply("⚠️ Format: `/approve <User_ID>`");
    
    const targetUserId = args[1].trim();
    if (!global.approvedList.includes(targetUserId)) {
        global.approvedList.push(targetUserId);
        ctx.reply(`✅ Success! User ID \`${targetUserId}\` ko successfully approve kar diya gaya hai.`);
        bot.telegram.sendMessage(targetUserId, "🥳 Mubarak ho! Admin ne aapka request approve kar diya hai Flipkart tracker ke liye.\n\nProduct track karne ke liye bhejien:\n`/start_track <Flipkart_URL>`");
    } else {
        ctx.reply("⚠️ Yeh user toh pehle se approved list mein hai.");
    }
});

bot.command('list_users', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID.toString()) {
        return ctx.reply("❌ Access Denied! Sirf Admin users dekh sakta hai.");
    }
    if (global.approvedList.length <= 1) return ctx.reply("👥 Abhi aapke alawa koi banda approved nahi hai.");
    
    let msg = "👥 **Flipkart Bot Approved Users List:**\n\n";
    let count = 1;
    global.approvedList.forEach((userId) => {
        if (userId !== ADMIN_CHAT_ID.toString()) {
            msg += `${count}. 🆔 User ID: \`${userId}\`\n\n`;
            count++;
        }
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
});

bot.command('remove_user', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID.toString()) {
        return ctx.reply("❌ Access Denied! Sirf Admin user remove kar sakta hai.");
    }
    const args = ctx.message.text.split(' ').filter(arg => arg.trim() !== '');
    if (args.length < 2) return ctx.reply("⚠️ Format: `/remove_user <User_ID>`");
    const targetUserId = args[1].trim();
    
    const index = global.approvedList.indexOf(targetUserId);
    if (index > -1) {
        global.approvedList.splice(index, 1);
        if (activeUsers[targetUserId]) {
            activeUsers[targetUserId].forEach(item => clearInterval(item.interval));
            delete activeUsers[targetUserId];
        }
        ctx.reply(`✅ User ID ${targetUserId} ko kick out kar diya gaya hai.`);
        bot.telegram.sendMessage(targetUserId, "🔒 Admin ne aapka access remove kar diya hai. Ab aap commands use nahi kar sakte.");
    } else { ctx.reply("⚠️ ID approved list mein nahi mili."); }
});

// ─── 🛒 USER TRACKING COMMANDS (WITH INTERNAL PROTECTION) ───

bot.command('start_track', async (ctx) => {
    const userId = ctx.from.id.toString();
    // Agar unapproved banda chalaega toh sidhe reject hoga
    if (!global.approvedList.includes(userId)) return ctx.reply("❌ Aap approved nahi hain. Pehle /start daba kar permission lein.");
    
    const chatId = ctx.chat.id.toString();
    const args = ctx.message.text.replace(/\n/g, ' ').split(' ').filter(arg => arg.trim() !== '');
    const flipkartLink = args.find(arg => arg.includes('flipkart.com') || arg.includes('fkrt.it'));
    
    if (!flipkartLink) return ctx.reply("❌ Valid Flipkart link bhejo!");
    if (!activeUsers[chatId]) activeUsers[chatId] = [];
    if (activeUsers[chatId].some(item => item.url === flipkartLink)) return ctx.reply("⚠️ Yeh link aap pehle se track kar rahe ho!");
    
    const intervalId = setInterval(() => { checkFlipkartStock(ctx, chatId, flipkartLink); }, CHECK_INTERVAL);
    activeUsers[chatId].push({ url: flipkartLink, interval: intervalId });
    ctx.reply(`🚀 Flipkart tracking chalu ho gayi hai...`);
    checkFlipkartStock(ctx, chatId, flipkartLink);
});

bot.command('list_track', (ctx) => {
    const userId = ctx.from.id.toString();
    if (!global.approvedList.includes(userId)) return ctx.reply("❌ Unapproved!");
    
    const chatId = ctx.chat.id.toString();
    if (!activeUsers[chatId] || activeUsers[chatId].length === 0) return ctx.reply("😴 Koyi active tracking nahi hai.");
    let msg = "📋 **Active Flipkart Tracking Links:**\n\n";
    activeUsers[chatId].forEach((item, i) => { msg += `${i + 1}. ${item.url}\n\n`; });
    ctx.reply(msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.command('stop_all', (ctx) => {
    const userId = ctx.from.id.toString();
    if (!global.approvedList.includes(userId)) return ctx.reply("❌ Unapproved!");
    
    const chatId = ctx.chat.id.toString();
    if (activeUsers[chatId] && activeUsers[chatId].length > 0) {
        activeUsers[chatId].forEach(item => clearInterval(item.interval));
        delete activeUsers[chatId];
        ctx.reply("🛑 Saari tracking band kar di gayi.");
    } else { ctx.reply("⚠️ Koyi active tracking nahi mili."); }
});

async function checkFlipkartStock(ctx, chatId, targetUrl) {
    if (!activeUsers[chatId]) return;
    const itemIndex = activeUsers[chatId].findIndex(item => item.url === targetUrl);
    if (itemIndex === -1) return;

    const randomAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    try {
        const response = await axios.get(targetUrl, { headers: { 'User-Agent': randomAgent, 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 8000 });
        const $ = cheerio.load(response.data);
        const pageText = $('body').text().toLowerCase();
        
        const isOutOfStock = pageText.includes('currently unavailable') || 
                             pageText.includes('this item is currently out of stock') || 
                             pageText.includes('notify me');
                             
        if (!isOutOfStock && (pageText.includes('buy now') || pageText.includes('add to cart'))) {
            await bot.telegram.sendMessage(chatId, `🚨 STOCK AAGYA 🚨\n\n🔥 bhai flipkart pr stock aagya jldi lga jake 🔥\n\nLink:\n${targetUrl}`,
                Markup.inlineKeyboard([[Markup.button.callback('Stop Tracking 🛑', `stop_url_${itemIndex}`)]])
            );
        }
    } catch (e) { console.log(`[Flipkart Bypass] Error, retrying...`); }
}

bot.launch().then(() => console.log("Flipkart Super-Secure Bot initiated..."));
