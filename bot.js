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

// Uses environment variables from Heroku
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

console.log('🚀 Starting Telegram Bot...');

const bot = new TelegramBot(TELEGRAM_TOKEN, { 
  polling: true
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Bot is working! Use /earnings ID');
});

bot.onText(/\/earnings (.+)/, async (msg, match) => {
  try {
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${match[1]}`);
    bot.sendMessage(msg.chat.id, response.data.message);
  } catch (error) {
    bot.sendMessage(msg.chat.id, 'Error fetching earnings');
  }
});

bot.onText(/\/register/, (msg) => {
  bot.sendMessage(msg.chat.id, 'Use /earnings YOUR_MEMBER_ID to check earnings');
});

console.log('✅ Bot is running!');
