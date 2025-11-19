const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Earnings Bot is running on Heroku...');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Your bot code - uses environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

console.log('🚀 Starting Telegram Bot on Heroku...');

if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN environment variable is missing');
  process.exit(1);
}

if (!WEB_APP_URL) {
  console.log('❌ ERROR: WEB_APP_URL environment variable is missing');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { 
  polling: true,
  request: {
    timeout: 10000
  }
});

// Store temporary user data
const userStates = new Map();

// Test connection
bot.getMe().then(botInfo => {
  console.log('✅ Bot connected successfully:', botInfo.username);
}).catch(error => {
  console.log('❌ Bot connection failed:', error.message);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `👋 Welcome to Earnings Bot!\n\n` +
                        `💰 **Auto-Registration System**\n\n` +
                        `Available Commands:\n` +
                        `/register - Get your Member ID\n` +
                        `/myid - Find your Member ID\n` +
                        `/earnings <ID> - Check earnings\n` +
                        `/help - Show help`;
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/register/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.first_name + (msg.from.last_name ? ' ' + msg.from.last_name : '');
  
  userStates.set(chatId, { userId, userName, step: 'awaiting_investment' });
  
  bot.sendMessage(chatId, 
    "💰 **Registration Process**\n\n" +
    "Please enter your investment amount (USD):\n" +
    "Example: 1000\n\n" +
    "Or type '0' if no investment yet."
  );
});

// Handle investment input
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text.startsWith('/') && userStates.has(chatId)) {
    const userData = userStates.get(chatId);
    
    if (userData.step === 'awaiting_investment') {
      const investment = parseFloat(text);
      
      if (isNaN(investment)) {
        return bot.sendMessage(chatId, "❌ Please enter a valid number.");
      }
      
      try {
        await bot.sendChatAction(chatId, 'typing');
        const response = await axios.get(
          `${WEB_APP_URL}?action=register&telegramId=${userData.userId}&userName=${encodeURIComponent(userData.userName)}&investment=${investment}`
        );
        
        const data = response.data;
        userStates.delete(chatId);
        bot.sendMessage(chatId, data.message);
      } catch (error) {
        userStates.delete(chatId);
        bot.sendMessage(chatId, "❌ Registration failed. Try again.");
      }
    }
  }
});

bot.onText(/\/earnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].trim();
  
  try {
    await bot.sendChatAction(chatId, 'typing');
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${encodeURIComponent(memberId)}`);
    const data = response.data;
    bot.sendMessage(chatId, data.message);
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error fetching earnings.');
  }
});

bot.onText(/\/myid/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    const response = await axios.get(`${WEB_APP_URL}?action=findMyId&telegramId=${userId}`);
    const data = response.data;
    bot.sendMessage(chatId, data.message);
  } catch (error) {
    bot.sendMessage(chatId, "❌ Error finding your ID.");
  }
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    "Commands:\n" +
    "/register - Get Member ID\n" +
    "/myid - Find your ID\n" +
    "/earnings ID - Check earnings\n" +
    "/start - Welcome message"
  );
});

console.log('✅ Bot is running on Heroku...');
