const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Data storage files
const USERS_FILE = 'users.json';
const SUPPORT_TICKETS_FILE = 'support_tickets.json';
const FAKE_MEMBERS_FILE = 'fake_members.json';
const SUPPORT_CHATS_FILE = 'support_chats.json';
const REFERRALS_FILE = 'referrals.json';

// Initialize data storage
async function initStorage() {
  try {
    const files = [USERS_FILE, SUPPORT_TICKETS_FILE, FAKE_MEMBERS_FILE, SUPPORT_CHATS_FILE, REFERRALS_FILE];
    
    for (const file of files) {
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, JSON.stringify([]));
      }
    }
    
    // Generate fake members if not exists
    const fakeMembers = JSON.parse(await fs.readFile(FAKE_MEMBERS_FILE, 'utf8') || '[]');
    if (fakeMembers.length === 0) {
      const initialFakeMembers = generateFakeMembers(50);
      await fs.writeFile(FAKE_MEMBERS_FILE, JSON.stringify(initialFakeMembers, null, 2));
    }
    
    console.log('✅ Storage initialized');
  } catch (error) {
    console.log('❌ Storage initialization failed:', error.message);
  }
}

// Load data
async function loadData(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Save data
async function saveData(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.log('❌ Error saving data:', error.message);
    return false;
  }
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Check if user is admin
function isAdmin(chatId) {
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  return adminIds.includes(chatId.toString());
}

// Generate fake members
function generateFakeMembers(count) {
  const fakeMembers = [];
  const names = ['John', 'Emma', 'Michael', 'Sophia', 'James', 'Olivia', 'Robert', 'Ava', 'David', 'Isabella'];
  const countries = ['US', 'UK', 'CA', 'AU', 'DE', 'FR', 'JP', 'SG', 'NG', 'KE'];
  
  for (let i = 1; i <= count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const country = countries[Math.floor(Math.random() * countries.length)];
    const earnings = Math.floor(Math.random() * 5000) + 100;
    const referrals = Math.floor(Math.random() * 20);
    const joinDate = new Date(Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000);
    
    fakeMembers.push({
      memberId: `FAKE-${1000 + i}`,
      name: `${name} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`,
      country,
      earnings,
      referrals,
      joinDate: joinDate.toISOString().split('T')[0],
      status: Math.random() > 0.3 ? 'active' : 'pending',
      isFake: true,
      balance: earnings * 0.8 // Fake balance
    });
  }
  
  return fakeMembers;
}

// Get real earnings from Google Sheets/API
async function getRealEarnings(memberId) {
  try {
    const WEB_APP_URL = process.env.WEB_APP_URL;
    if (!WEB_APP_URL) {
      throw new Error('WEB_APP_URL not configured');
    }
    
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${encodeURIComponent(memberId)}`, {
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    console.log('❌ Error fetching earnings:', error.message);
    return { success: false, message: 'Unable to fetch earnings', balance: 0, referrals: 0 };
  }
}

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initStorage();
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('🤖 Enhanced Earnings Bot is running...');
});

// Bot initialization
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN is missing');
  process.exit(1);
}

let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: {
      interval: 300,
      timeout: 10,
      autoStart: true
    }
  });
  console.log('✅ Bot instance created');
} catch (error) {
  console.log('❌ Bot creation failed:', error.message);
  process.exit(1);
}

// User sessions
const userSessions = {};

// Start command - FIXED
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match ? match[1] : null;
  const username = msg.from.username || msg.from.first_name;
  console.log('📱 Received /start from:', chatId, 'Referral:', referralCode);
  
  // Check if user is in registration process
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    if (user.banned) {
      bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support for assistance.');
      return;
    }
    
    // Update last login
    user.lastLogin = new Date().toISOString();
    await saveData(USERS_FILE, users);
    
    const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                          `🏷️ Member ID: ${user.memberId}\n` +
                          `💰 Balance: $${user.balance || 0}\n` +
                          `👥 Referrals: ${user.referrals || 0}\n` +
                          `🔗 Your Referral Code: ${user.referralCode}\n\n` +
                          `📋 Available commands:\n` +
                          `/earnings - Check your earnings\n` +
                          `/withdraw - Withdraw funds\n` +
                          `/profile - View/Edit profile\n` +
                          `/support - Contact support\n` +
                          `/referral - Share referral code\n` +
                          `/help - Show all commands`;
    
    bot.sendMessage(chatId, welcomeMessage);
  } else {
    // Handle referral if provided
    if (referralCode) {
      userSessions[chatId] = {
        referralCode: referralCode,
        step: 'awaiting_registration'
      };
    }
    
    // Show fake members to give hope
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    const recentFakeMembers = fakeMembers.slice(0, 5);
    
    let fakeMembersMessage = '🌟 **Recent Successful Members:**\n\n';
    recentFakeMembers.forEach(member => {
      fakeMembersMessage += `✅ ${member.name} earned $${member.earnings} with ${member.referrals} referrals\n`;
    });
    
    fakeMembersMessage += '\n🚀 Join now and start earning!\n\n';
    fakeMembersMessage += 'Please choose an option:\n';
    fakeMembersMessage += '/register - Create an account\n';
    fakeMembersMessage += '/login - Login to existing account\n';
    fakeMembersMessage += '/help - More information';
    
    if (referralCode) {
      fakeMembersMessage += `\n\n🎁 You were invited by a friend! Use /register to claim your bonus.`;
    }
    
    bot.sendMessage(chatId, fakeMembersMessage, { parse_mode: 'Markdown' });
  }
});

// Help command - FIXED
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  console.log('✅ Received /help from:', chatId);
  
  const helpMessage = `🤖 **Earnings Bot - Help Menu**\n\n` +
                     `**Account Commands:**\n` +
                     `/start - Start the bot\n` +
                     `/register - Create new account\n` +
                     `/login - Login to existing account\n` +
                     `/profile - View your profile\n` +
                     `/resetpassword - Reset your password\n\n` +
                     `**Earnings Commands:**\n` +
                     `/earnings - Check your earnings\n` +
                     `/withdraw - Withdraw funds\n` +
                     `/referral - Share your referral code\n\n` +
                     `**Support:**\n` +
                     `/support - Contact support\n` +
                     `/ticket - Check ticket status\n\n` +
                     `**Admin Commands:**\n` +
                     `/admin login - Admin login\n` +
                     `/admin help - Admin help\n\n` +
                     `💡 Tip: Share your referral code to earn bonuses!\n` +
                     `📞 Support: @starlifeadvert`;
  
  try {
    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    console.log('✅ Sent help message to:', chatId);
  } catch (error) {
    console.log('❌ Error sending help message:', error.message);
    // Send without markdown
    const plainMessage = helpMessage.replace(/\*\*/g, '').replace(/\n\n/g, '\n');
    await bot.sendMessage(chatId, plainMessage);
  }
});

// Registration command - ENHANCED with email/phone
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if already registered
  const users = await loadData(USERS_FILE);
  const existingUser = users.find(u => u.chatId === chatId.toString());
  
  if (existingUser) {
    bot.sendMessage(chatId, '✅ You already have an account. Use /login to access your account.');
    return;
  }
  
  // Start registration process
  userSessions[chatId] = {
    step: 'awaiting_member_id',
    data: {}
  };
  
  const message = `📝 **Account Registration**\n\n` +
                 `Step 1/5: Enter your Official Member ID\n` +
                 `(Provided by your organization)\n\n` +
                 `Format: SLA-XXX (e.g., SLA-123)\n\n` +
                 `Type your Member ID:`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Handle registration steps with email/phone
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    switch (session.step) {
      case 'awaiting_member_id':
        const memberId = text.trim().toUpperCase();
        
        // Check if member ID starts with SLA-
        if (!memberId.startsWith('SLA-')) {
          bot.sendMessage(chatId, '❌ Invalid Member ID format. It should start with SLA- (e.g., SLA-123)');
          delete userSessions[chatId];
          return;
        }
        
        // Check if member ID already exists
        const users = await loadData(USERS_FILE);
        const existingMember = users.find(u => u.memberId === memberId);
        
        if (existingMember) {
          bot.sendMessage(chatId, '❌ This Member ID is already registered. Please login with /login');
          delete userSessions[chatId];
          return;
        }
        
        session.data.memberId = memberId;
        session.step = 'awaiting_password';
        
        bot.sendMessage(chatId, `✅ Step 1/5: Member ID saved\n\n` +
                               `Step 2/5: Create a secure password\n\n` +
                               `Password requirements:\n` +
                               `• At least 8 characters\n` +
                               `• Include letters and numbers\n\n` +
                               `Enter your password:`);
        break;
        
      case 'awaiting_password':
        if (text.length < 8) {
          bot.sendMessage(chatId, '❌ Password must be at least 8 characters. Please try again:');
          return;
        }
        
        session.data.passwordHash = hashPassword(text);
        session.step = 'awaiting_name';
        
        bot.sendMessage(chatId, `✅ Step 2/5: Password saved\n\n` +
                               `Step 3/5: Enter your full name\n\n` +
                               `Example: John Doe\n` +
                               `Enter your full name:`);
        break;
        
      case 'awaiting_name':
        session.data.name = text.trim();
        session.step = 'awaiting_email';
        
        bot.sendMessage(chatId, `✅ Step 3/5: Name saved\n\n` +
                               `Step 4/5: Enter your email address\n\n` +
                               `Example: john.doe@email.com\n` +
                               `Enter your email:`);
        break;
        
      case 'awaiting_email':
        const email = text.trim().toLowerCase();
        // Basic email validation
        if (!email.includes('@') || !email.includes('.')) {
          bot.sendMessage(chatId, '❌ Invalid email format. Please enter a valid email:');
          return;
        }
        
        session.data.email = email;
        session.step = 'awaiting_phone';
        
        bot.sendMessage(chatId, `✅ Step 4/5: Email saved\n\n` +
                               `Step 5/5: Enter your phone number\n\n` +
                               `Example: +1234567890\n` +
                               `Enter your phone number:`);
        break;
        
      case 'awaiting_phone':
        const phone = text.trim();
        
        // Create new user with referral bonus if applicable
        const newUser = {
          chatId: chatId.toString(),
          memberId: session.data.memberId,
          passwordHash: session.data.passwordHash,
          name: session.data.name,
          email: session.data.email,
          phone: phone,
          balance: 10, // Initial bonus
          earnings: 0,
          referrals: 0,
          referralCode: `REF-${session.data.memberId}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          joinedDate: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          banned: false,
          isFake: false,
          requiresPasswordReset: false
        };
        
        // Add referral bonus if user came through referral
        if (session.referralCode) {
          // Find referrer
          const allUsers = await loadData(USERS_FILE);
          const referrer = allUsers.find(u => u.referralCode === session.referralCode);
          
          if (referrer) {
            // Update referrer's stats
            const referrerIndex = allUsers.findIndex(u => u.chatId === referrer.chatId);
            if (referrerIndex !== -1) {
              allUsers[referrerIndex].referrals = (allUsers[referrerIndex].referrals || 0) + 1;
              allUsers[referrerIndex].balance = (allUsers[referrerIndex].balance || 0) + 5; // $5 referral bonus
              
              // Save referral record
              const referrals = await loadData(REFERRALS_FILE);
              referrals.push({
                referrerId: referrer.memberId,
                referredId: newUser.memberId,
                referrerName: referrer.name,
                referredName: newUser.name,
                bonusAmount: 5,
                date: new Date().toISOString(),
                status: 'completed'
              });
              await saveData(REFERRALS_FILE, referrals);
              
              // Notify referrer
              try {
                bot.sendMessage(referrer.chatId, 
                  `🎉 **Referral Bonus!**\n\n` +
                  `${newUser.name} joined using your referral code!\n` +
                  `💰 You earned: $5\n` +
                  `👥 Total referrals: ${allUsers[referrerIndex].referrals}\n` +
                  `💵 New balance: $${allUsers[referrerIndex].balance}`
                );
              } catch (error) {
                console.log('Could not notify referrer:', error.message);
              }
              
              await saveData(USERS_FILE, allUsers);
              
              // Give new user extra bonus
              newUser.balance += 5;
              newUser.referredBy = referrer.memberId;
            }
          }
        }
        
        // Save new user
        const currentUsers = await loadData(USERS_FILE);
        currentUsers.push(newUser);
        await saveData(USERS_FILE, currentUsers);
        
        // Clear session
        delete userSessions[chatId];
        
        // Send success message
        const successMessage = `🎉 **Registration Successful!**\n\n` +
                              `Welcome to Earnings Platform, ${newUser.name}!\n\n` +
                              `📋 **Your Account Details:**\n` +
                              `• Name: ${newUser.name}\n` +
                              `• Member ID: ${newUser.memberId}\n` +
                              `• Email: ${newUser.email}\n` +
                              `• Phone: ${newUser.phone}\n` +
                              `• Referral Code: ${newUser.referralCode}\n` +
                              `• Initial Balance: $${newUser.balance}\n` +
                              `• Join Date: ${new Date().toLocaleDateString()}\n\n` +
                              `🚀 **Start Earning:**\n` +
                              `1. Share your referral code to earn $5 per referral\n` +
                              `2. Complete tasks to increase earnings\n` +
                              `3. Minimum withdrawal: $50\n\n` +
                              `📱 **Quick Commands:**\n` +
                              `/earnings - Check balance\n` +
                              `/withdraw - Withdraw funds\n` +
                              `/referral - Share referral code\n` +
                              `/profile - Update info\n` +
                              `/help - All commands`;
        
        bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
        
        // Notify admin
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        if (adminIds.length > 0) {
          const adminMessage = `👤 **New User Registered**\n\n` +
                              `Name: ${newUser.name}\n` +
                              `Member ID: ${newUser.memberId}\n` +
                              `Email: ${newUser.email}\n` +
                              `Phone: ${newUser.phone}\n` +
                              `Chat ID: ${chatId}\n` +
                              `Time: ${new Date().toLocaleString()}`;
          
          adminIds.forEach(adminId => {
            bot.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' }).catch(console.error);
          });
        }
        break;
    }
  } catch (error) {
    console.log('❌ Registration error:', error.message);
    bot.sendMessage(chatId, '❌ An error occurred. Please start over with /register');
    delete userSessions[chatId];
  }
});

// Referral command
bot.onText(/\/referral/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ Please login first with /login or register with /register');
    return;
  }
  
  const referralMessage = `🔗 **Your Referral Program**\n\n` +
                         `Your Referral Code:\n` +
                         `\`${user.referralCode}\`\n\n` +
                         `💰 **Earn $5 for every friend who joins!**\n\n` +
                         `**How it works:**\n` +
                         `1. Share this link with friends:\n` +
                         `https://t.me/${(await bot.getMe()).username}?start=${user.referralCode}\n\n` +
                         `2. Friend clicks link and registers\n` +
                         `3. You get $5 instantly!\n\n` +
                         `📊 **Your Stats:**\n` +
                         `• Total Referrals: ${user.referrals || 0}\n` +
                         `• Referral Earnings: $${(user.referrals || 0) * 5}\n\n` +
                         `📱 **Quick Share:**\n` +
                         `Copy and send this message to friends:\n\n` +
                         `🎉 Join me on Earnings Platform!\n` +
                         `Use my referral code: ${user.referralCode}\n` +
                         `Start earning now: https://t.me/${(await bot.getMe()).username}?start=${user.referralCode}`;
  
  bot.sendMessage(chatId, referralMessage, { parse_mode: 'Markdown' });
});

// Earnings command - INTEGRATED WITH SHEET/API
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ Please login first with /login or register with /register to view earnings.');
    return;
  }
  
  if (user.banned) {
    bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support for assistance.');
    return;
  }
  
  try {
    // Get real earnings from Google Sheets/API
    const earningsData = await getRealEarnings(user.memberId);
    
    // Update user balance with real data if available
    if (earningsData.success && earningsData.balance !== undefined) {
      const userIndex = users.findIndex(u => u.chatId === chatId.toString());
      if (userIndex !== -1) {
        users[userIndex].balance = earningsData.balance;
        users[userIndex].earnings = earningsData.earnings || earningsData.balance;
        users[userIndex].referrals = earningsData.referrals || users[userIndex].referrals;
        await saveData(USERS_FILE, users);
        user.balance = earningsData.balance;
        user.earnings = earningsData.earnings || earningsData.balance;
        user.referrals = earningsData.referrals || user.referrals;
      }
    }
    
    const earningsMessage = `💰 **Your Earnings Dashboard**\n\n` +
                           `🏷️ Member ID: ${user.memberId}\n` +
                           `👤 Name: ${user.name}\n\n` +
                           `📊 **Account Summary**\n` +
                           `💰 Available Balance: $${user.balance || 0}\n` +
                           `📈 Total Earnings: $${user.earnings || user.balance || 0}\n` +
                           `👥 Successful Referrals: ${user.referrals || 0}\n` +
                           `🎯 Referral Earnings: $${(user.referrals || 0) * 5}\n` +
                           `🔗 Your Referral Code: ${user.referralCode}\n\n` +
                           `💵 **Withdrawal Info**\n` +
                           `Minimum Withdrawal: $50\n` +
                           `Processing Time: 3-5 days\n\n` +
                           `📱 **Quick Actions**\n` +
                           `/withdraw - Withdraw funds\n` +
                           `/referral - Share referral code\n` +
                           `/profile - View profile`;
    
    bot.sendMessage(chatId, earningsMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.log('❌ Earnings fetch error:', error.message);
    
    // Fallback to stored data
    const fallbackMessage = `💰 **Your Earnings Dashboard**\n\n` +
                           `🏷️ Member ID: ${user.memberId}\n` +
                           `👤 Name: ${user.name}\n\n` +
                           `📊 **Account Summary**\n` +
                           `💰 Available Balance: $${user.balance || 0}\n` +
                           `👥 Successful Referrals: ${user.referrals || 0}\n` +
                           `🎯 Referral Earnings: $${(user.referrals || 0) * 5}\n` +
                           `🔗 Your Referral Code: ${user.referralCode}\n\n` +
                           `⚠️ *Earnings API is temporarily unavailable*\n\n` +
                           `📱 **Quick Actions**\n` +
                           `/withdraw - Withdraw funds\n` +
                           `/referral - Share referral code`;
    
    bot.sendMessage(chatId, fallbackMessage, { parse_mode: 'Markdown' });
  }
});

// Support Chat System
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ Please login first to contact support.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'support_message',
    data: { memberId: user.memberId, name: user.name }
  };
  
  const message = `🆘 **Support Center**\n\n` +
                 `Please describe your issue:\n` +
                 `• Account issues\n` +
                 `• Withdrawal problems\n` +
                 `• Profile changes\n` +
                 `• Technical problems\n` +
                 `• Other inquiries\n\n` +
                 `Type your message below:\n` +
                 `(Type /cancel to cancel)`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Handle support messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  if (session.step === 'support_message') {
    try {
      // Create support chat
      const supportChats = await loadData(SUPPORT_CHATS_FILE);
      const existingChat = supportChats.find(chat => chat.userChatId === chatId.toString() && chat.status === 'active');
      
      if (existingChat) {
        // Continue existing chat
        existingChat.messages.push({
          sender: 'user',
          message: text,
          timestamp: new Date().toISOString()
        });
        
        await saveData(SUPPORT_CHATS_FILE, supportChats);
        
        bot.sendMessage(chatId, '✅ Message sent to support team. They will respond soon.');
        
        // Notify all admins
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        adminIds.forEach(adminId => {
          bot.sendMessage(adminId, 
            `📨 **New Support Message**\n\n` +
            `From: ${session.data.name} (${session.data.memberId})\n` +
            `Chat ID: ${chatId}\n\n` +
            `Message: ${text}\n\n` +
            `Reply: /reply ${chatId} [your message]`,
            { parse_mode: 'Markdown' }
          ).catch(console.error);
        });
      } else {
        // Create new support chat
        const newChat = {
          id: `CHAT-${Date.now()}`,
          userChatId: chatId.toString(),
          memberId: session.data.memberId,
          userName: session.data.name,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [{
            sender: 'user',
            message: text,
            timestamp: new Date().toISOString()
          }]
        };
        
        supportChats.push(newChat);
        await saveData(SUPPORT_CHATS_FILE, supportChats);
        
        bot.sendMessage(chatId, 
          `✅ **Support ticket created!**\n\n` +
          `Ticket ID: ${newChat.id}\n` +
          `Our team will respond within 24 hours.\n\n` +
          `You can continue sending messages here.`
        );
        
        // Notify all admins
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        adminIds.forEach(adminId => {
          bot.sendMessage(adminId, 
            `🆘 **New Support Ticket**\n\n` +
            `Ticket ID: ${newChat.id}\n` +
            `From: ${session.data.name}\n` +
            `Member ID: ${session.data.memberId}\n` +
            `Chat ID: ${chatId}\n\n` +
            `Message: ${text}\n\n` +
            `Reply: /reply ${chatId} [message]`,
            { parse_mode: 'Markdown' }
          ).catch(console.error);
        });
      }
      
    } catch (error) {
      console.log('❌ Support error:', error.message);
      bot.sendMessage(chatId, '❌ Error sending message. Please try /support again.');
    }
  }
});

// Cancel command
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (userSessions[chatId]) {
    delete userSessions[chatId];
    bot.sendMessage(chatId, '❌ Operation cancelled.');
  }
});

// ============ ADMIN COMMANDS - FIXED ============

// Admin login command
bot.onText(/\/admin_login (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const credentials = match[1];
  
  const [username, password] = credentials.split(' ');
  
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    // Add to admin IDs
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (!adminIds.includes(chatId.toString())) {
      adminIds.push(chatId.toString());
      // Update environment variable (in memory only for this session)
      process.env.ADMIN_IDS = adminIds.join(',');
    }
    
    bot.sendMessage(chatId, 
      `✅ **Admin login successful!**\n\n` +
      `Welcome, Administrator!\n\n` +
      `📋 **Admin Commands:**\n` +
      `/admin_users - List all users\n` +
      `/admin_view MEMBER_ID - View user details\n` +
      `/admin_ban MEMBER_ID - Ban user\n` +
      `/admin_unban MEMBER_ID - Unban user\n` +
      `/admin_reset MEMBER_ID - Reset password\n` +
      `/admin_delete MEMBER_ID - Delete user\n` +
      `/admin_addfake COUNT - Add fake members\n` +
      `/admin_chats - Active support chats\n` +
      `/admin_reply CHAT_ID MESSAGE - Reply to user\n` +
      `/admin_stats - System statistics\n` +
      `/admin_logout - Logout from admin`
    );
  } else {
    bot.sendMessage(chatId, '❌ Invalid admin credentials');
  }
});

// Admin logout
bot.onText(/\/admin_logout/, async (msg) => {
  const chatId = msg.chat.id;
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  const index = adminIds.indexOf(chatId.toString());
  
  if (index !== -1) {
    adminIds.splice(index, 1);
    process.env.ADMIN_IDS = adminIds.join(',');
  }
  
  bot.sendMessage(chatId, '✅ Logged out from admin panel.');
});

// Admin view users
bot.onText(/\/admin_users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required. Use /admin_login');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake);
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    
    let message = `👥 **User Statistics**\n\n` +
                  `Real Users: ${realUsers.length}\n` +
                  `Fake Members: ${fakeMembers.length}\n` +
                  `Active: ${realUsers.filter(u => !u.banned).length}\n` +
                  `Banned: ${realUsers.filter(u => u.banned).length}\n\n` +
                  `**Recent Users (Last 10):**\n`;
    
    const recentUsers = realUsers.slice(-10).reverse();
    recentUsers.forEach((user, index) => {
      message += `${index + 1}. ${user.name} (${user.memberId}) - $${user.balance} ${user.banned ? '🚫' : '✅'}\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error fetching users');
  }
});

// Admin view user details
bot.onText(/\/admin_view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId && !u.isFake);
    
    if (!user) {
      bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const message = `👤 **User Details**\n\n` +
                   `Name: ${user.name}\n` +
                   `Member ID: ${user.memberId}\n` +
                   `Chat ID: ${user.chatId}\n` +
                   `Email: ${user.email || 'Not set'}\n` +
                   `Phone: ${user.phone || 'Not set'}\n` +
                   `Balance: $${user.balance || 0}\n` +
                   `Referrals: ${user.referrals || 0}\n` +
                   `Referral Code: ${user.referralCode}\n` +
                   `Joined: ${new Date(user.joinedDate).toLocaleString()}\n` +
                   `Last Login: ${new Date(user.lastLogin).toLocaleString()}\n` +
                   `Status: ${user.banned ? '🚫 BANNED' : '✅ Active'}\n\n` +
                   `**Admin Actions:**\n` +
                   `/admin_ban ${memberId} - Ban user\n` +
                   `/admin_reset ${memberId} - Reset password\n` +
                   `/admin_delete ${memberId} - Delete user`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error fetching user details');
  }
});

// Admin ban user
bot.onText(/\/admin_ban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].banned = true;
    await saveData(USERS_FILE, users);
    
    bot.sendMessage(chatId, `✅ User ${memberId} has been banned`);
    
    // Notify user
    try {
      bot.sendMessage(users[userIndex].chatId, 
        '🚫 **Account Banned**\n\n' +
        'Your account has been banned by administrator.\n' +
        'Contact support if you believe this is an error.'
      );
    } catch (error) {
      console.log('Could not notify banned user');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error banning user');
  }
});

// Admin unban user
bot.onText(/\/admin_unban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].banned = false;
    await saveData(USERS_FILE, users);
    
    bot.sendMessage(chatId, `✅ User ${memberId} has been unbanned`);
    
    // Notify user
    try {
      bot.sendMessage(users[userIndex].chatId, 
        '✅ **Account Unbanned**\n\n' +
        'Your account has been unbanned by administrator.\n' +
        'You can now access your account normally.'
      );
    } catch (error) {
      console.log('Could not notify unbanned user');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error unbanning user');
  }
});

// Admin reset password
bot.onText(/\/admin_reset (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const tempPassword = Math.random().toString(36).slice(-8);
    users[userIndex].passwordHash = hashPassword(tempPassword);
    users[userIndex].requiresPasswordReset = true;
    
    await saveData(USERS_FILE, users);
    
    bot.sendMessage(chatId, 
      `✅ Password reset for ${memberId}\n\n` +
      `Temporary Password: ${tempPassword}\n\n` +
      `User will be forced to change password on next login.`
    );
    
    // Notify user
    try {
      bot.sendMessage(users[userIndex].chatId, 
        '🔐 **Password Reset**\n\n' +
        'Your password has been reset by administrator.\n\n' +
        `Temporary Password: ${tempPassword}\n\n` +
        'Please login with this password and reset it immediately.'
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error resetting password');
  }
});

// Admin delete user
bot.onText(/\/admin_delete (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const deletedUser = users.splice(userIndex, 1)[0];
    await saveData(USERS_FILE, users);
    
    bot.sendMessage(chatId, `✅ User ${memberId} (${deletedUser.name}) has been deleted`);
    
    // Notify user
    try {
      bot.sendMessage(deletedUser.chatId, 
        '❌ **Account Deleted**\n\n' +
        'Your account has been deleted by administrator.'
      );
    } catch (error) {
      console.log('Could not notify deleted user');
    }
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error deleting user');
  }
});

// Admin add fake members
bot.onText(/\/admin_addfake (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const count = parseInt(match[1]);
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  if (isNaN(count) || count < 1 || count > 1000) {
    bot.sendMessage(chatId, '❌ Please specify a number between 1 and 1000');
    return;
  }
  
  try {
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    const newFakeMembers = generateFakeMembers(count);
    fakeMembers.push(...newFakeMembers);
    
    await saveData(FAKE_MEMBERS_FILE, fakeMembers);
    
    bot.sendMessage(chatId, 
      `✅ Added ${count} fake members\n` +
      `Total fake members: ${fakeMembers.length}`
    );
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error adding fake members');
  }
});

// Admin view support chats
bot.onText(/\/admin_chats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const activeChats = supportChats.filter(chat => chat.status === 'active');
    
    if (activeChats.length === 0) {
      bot.sendMessage(chatId, '✅ No active support chats');
      return;
    }
    
    let message = `📞 **Active Support Chats (${activeChats.length})**\n\n`;
    
    activeChats.forEach((chat, index) => {
      message += `${index + 1}. ${chat.userName} (${chat.memberId})\n`;
      message += `   Chat ID: ${chat.userChatId}\n`;
      message += `   Created: ${new Date(chat.createdAt).toLocaleDateString()}\n`;
      message += `   Messages: ${chat.messages.length}\n`;
      message += `   Reply: /admin_reply ${chat.userChatId} [message]\n\n`;
    });
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error fetching support chats');
  }
});

// Admin reply to user
bot.onText(/\/admin_reply (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const params = match[1].split(' ');
  const userChatId = params[0];
  const message = params.slice(1).join(' ');
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  if (!message) {
    bot.sendMessage(chatId, '❌ Usage: /admin_reply CHAT_ID your message here');
    return;
  }
  
  try {
    // Send message to user
    await bot.sendMessage(userChatId, 
      `📨 **Support Response**\n\n` +
      `${message}\n\n` +
      `💬 You can continue this conversation by replying here.`
    );
    
    // Update support chat
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const chatIndex = supportChats.findIndex(chat => chat.userChatId === userChatId && chat.status === 'active');
    
    if (chatIndex !== -1) {
      supportChats[chatIndex].messages.push({
        sender: 'admin',
        message: message,
        timestamp: new Date().toISOString()
      });
      supportChats[chatIndex].updatedAt = new Date().toISOString();
      
      await saveData(SUPPORT_CHATS_FILE, supportChats);
    }
    
    bot.sendMessage(chatId, `✅ Message sent to user ${userChatId}`);
  } catch (error) {
    bot.sendMessage(chatId, `❌ Error sending message: ${error.message}`);
  }
});

// Admin stats
bot.onText(/\/admin_stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake);
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    const supportChats = await loadData(SUPPORT_CHATS_FILE);
    const referrals = await loadData(REFERRALS_FILE);
    
    const totalBalance = realUsers.reduce((sum, user) => sum + (user.balance || 0), 0);
    const totalReferrals = referrals.length;
    const referralBonuses = totalReferrals * 5;
    
    const message = `📊 **System Statistics**\n\n` +
                   `**Users:**\n` +
                   `• Real Users: ${realUsers.length}\n` +
                   `• Fake Members: ${fakeMembers.length}\n` +
                   `• Active Users: ${realUsers.filter(u => !u.banned).length}\n` +
                   `• Banned Users: ${realUsers.filter(u => u.banned).length}\n\n` +
                   `**Financial:**\n` +
                   `• Total Balance: $${totalBalance}\n` +
                   `• Total Referrals: ${totalReferrals}\n` +
                   `• Referral Bonuses Paid: $${referralBonuses}\n\n` +
                   `**Support:**\n` +
                   `• Active Chats: ${supportChats.filter(c => c.status === 'active').length}\n` +
                   `• Total Tickets: ${supportChats.length}\n\n` +
                   `**System:**\n` +
                   `• Uptime: ${process.uptime().toFixed(0)} seconds\n` +
                   `• Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
    
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    bot.sendMessage(chatId, '❌ Error fetching statistics');
  }
});

// Handle unknown commands
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text && text.startsWith('/') && 
      !text.startsWith('/start') && 
      !text.startsWith('/help') &&
      !text.startsWith('/register') &&
      !text.startsWith('/login') &&
      !text.startsWith('/earnings') &&
      !text.startsWith('/withdraw') &&
      !text.startsWith('/profile') &&
      !text.startsWith('/support') &&
      !text.startsWith('/referral') &&
      !text.startsWith('/resetpassword') &&
      !text.startsWith('/cancel') &&
      !text.startsWith('/admin_')) {
    
    console.log('❓ Unknown command:', text);
    bot.sendMessage(chatId, 
      '❓ Unknown command. Use /help to see available commands.\n\n' +
      'For admin commands, use /admin_login'
    );
  }
});

// Process cleanup
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('✅ Enhanced bot setup complete - waiting for messages...');
