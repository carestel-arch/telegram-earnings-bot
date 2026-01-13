const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to PostgreSQL:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

// Create tables if they don't exist
async function createTables() {
  const tables = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      member_id VARCHAR(50) UNIQUE NOT NULL,
      chat_id VARCHAR(50),
      telegram_account_id VARCHAR(50),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100),
      password_hash VARCHAR(255) NOT NULL,
      balance DECIMAL(15,2) DEFAULT 0,
      total_invested DECIMAL(15,2) DEFAULT 0,
      total_earned DECIMAL(15,2) DEFAULT 0,
      referral_earnings DECIMAL(15,2) DEFAULT 0,
      referrals INTEGER DEFAULT 0,
      referral_code VARCHAR(50) UNIQUE,
      referred_by VARCHAR(50),
      active_investments INTEGER DEFAULT 0,
      joined_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      last_password_change TIMESTAMP,
      banned BOOLEAN DEFAULT FALSE,
      bot_blocked BOOLEAN DEFAULT FALSE,
      account_bound BOOLEAN DEFAULT TRUE,
      offline_messages JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Investments table
    `CREATE TABLE IF NOT EXISTS investments (
      id SERIAL PRIMARY KEY,
      investment_id VARCHAR(50) UNIQUE NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      payment_method VARCHAR(100),
      transaction_hash TEXT,
      paypal_email VARCHAR(100),
      status VARCHAR(20) DEFAULT 'pending',
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      days_active INTEGER DEFAULT 0,
      total_profit DECIMAL(15,2) DEFAULT 0,
      proof_media_id VARCHAR(100),
      proof_caption TEXT,
      approved_at TIMESTAMP,
      approved_by VARCHAR(50),
      rejected_at TIMESTAMP,
      rejected_by VARCHAR(50),
      is_manual BOOLEAN DEFAULT FALSE,
      admin_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Withdrawals table
    `CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      withdrawal_id VARCHAR(50) UNIQUE NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      fee DECIMAL(15,2) DEFAULT 0,
      net_amount DECIMAL(15,2) NOT NULL,
      method VARCHAR(50),
      details TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP,
      approved_by VARCHAR(50),
      rejected_at TIMESTAMP,
      rejected_by VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Referrals table
    `CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referral_id VARCHAR(50) UNIQUE NOT NULL,
      referrer_id VARCHAR(50) NOT NULL,
      referrer_name VARCHAR(100),
      referrer_code VARCHAR(50),
      referred_id VARCHAR(50) NOT NULL,
      referred_name VARCHAR(100),
      bonus_amount DECIMAL(15,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      investment_amount DECIMAL(15,2) DEFAULT 0,
      is_first_investment BOOLEAN DEFAULT TRUE,
      bonus_paid BOOLEAN DEFAULT FALSE,
      paid_at TIMESTAMP,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Fake members table
    `CREATE TABLE IF NOT EXISTS fake_members (
      id SERIAL PRIMARY KEY,
      fake_member_id VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      investment DECIMAL(15,2) NOT NULL,
      profit DECIMAL(15,2) NOT NULL,
      referrals INTEGER DEFAULT 0,
      join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_fake BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Transactions table
    `CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      transaction_id VARCHAR(50) UNIQUE NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      description TEXT,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      admin_id VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Support chats table
    `CREATE TABLE IF NOT EXISTS support_chats (
      id SERIAL PRIMARY KEY,
      chat_id VARCHAR(100) UNIQUE NOT NULL,
      user_id VARCHAR(100),
      user_name VARCHAR(100),
      user_chat_id VARCHAR(50),
      topic VARCHAR(200),
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      messages JSONB DEFAULT '[]',
      admin_replied BOOLEAN DEFAULT FALSE,
      no_account BOOLEAN DEFAULT FALSE,
      is_logged_out BOOLEAN DEFAULT FALSE,
      is_appeal BOOLEAN DEFAULT FALSE,
      closed_by VARCHAR(50),
      is_direct_message BOOLEAN DEFAULT FALSE
    )`,

    // Earnings views table
    `CREATE TABLE IF NOT EXISTS earnings_views (
      id SERIAL PRIMARY KEY,
      view_id VARCHAR(50) UNIQUE NOT NULL,
      viewer_id VARCHAR(50) NOT NULL,
      viewed_id VARCHAR(50) NOT NULL,
      fee DECIMAL(15,2) DEFAULT 0,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Media files table
    `CREATE TABLE IF NOT EXISTS media_files (
      id SERIAL PRIMARY KEY,
      media_id VARCHAR(100) UNIQUE NOT NULL,
      file_id TEXT NOT NULL,
      file_type VARCHAR(50) NOT NULL,
      caption TEXT,
      chat_id VARCHAR(100),
      investment_id VARCHAR(50),
      sender VARCHAR(50),
      sender_id VARCHAR(100),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  try {
    for (const tableQuery of tables) {
      await pool.query(tableQuery);
    }
    console.log('✅ All tables created/verified');
    
    // Initialize fake members if empty
    const fakeCount = await pool.query('SELECT COUNT(*) FROM fake_members');
    if (parseInt(fakeCount.rows[0].count) === 0) {
      await generateFakeMembers(50);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
    return false;
  }
}

// ==================== DATABASE HELPER FUNCTIONS ====================

// Generic query function
async function query(text, params) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error.message);
    throw error;
  }
}

// ==================== DATA ACCESS FUNCTIONS ====================

// Users
async function getUsers() {
  const result = await query('SELECT * FROM users ORDER BY created_at DESC', []);
  return result.rows;
}

async function getUserByMemberId(memberId) {
  const result = await query('SELECT * FROM users WHERE member_id = $1', [memberId]);
  return result.rows[0] || null;
}

async function getUserByChatId(chatId) {
  const result = await query('SELECT * FROM users WHERE chat_id = $1', [chatId]);
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function createUser(userData) {
  const {
    memberId, chatId, name, email, passwordHash, referralCode, referredBy
  } = userData;
  
  const result = await query(
    `INSERT INTO users (member_id, chat_id, telegram_account_id, name, email, password_hash, referral_code, referred_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [memberId, chatId, chatId, name, email, passwordHash, referralCode, referredBy]
  );
  return result.rows[0];
}

async function updateUser(memberId, updates) {
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = [memberId, ...Object.values(updates)];
  
  const result = await query(
    `UPDATE users SET ${setClause} WHERE member_id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

// Investments
async function getInvestments() {
  const result = await query('SELECT * FROM investments ORDER BY created_at DESC', []);
  return result.rows;
}

async function getUserInvestments(memberId) {
  const result = await query('SELECT * FROM investments WHERE member_id = $1 ORDER BY created_at DESC', [memberId]);
  return result.rows;
}

async function createInvestment(investmentData) {
  const {
    investmentId, memberId, amount, paymentMethod, transactionHash, paypalEmail, proofMediaId, proofCaption
  } = investmentData;
  
  const result = await query(
    `INSERT INTO investments (investment_id, member_id, amount, payment_method, transaction_hash, paypal_email, proof_media_id, proof_caption)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [investmentId, memberId, amount, paymentMethod, transactionHash, paypalEmail, proofMediaId, proofCaption]
  );
  return result.rows[0];
}

async function updateInvestment(investmentId, updates) {
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = [investmentId, ...Object.values(updates)];
  
  const result = await query(
    `UPDATE investments SET ${setClause} WHERE investment_id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

// Withdrawals
async function getWithdrawals() {
  const result = await query('SELECT * FROM withdrawals ORDER BY created_at DESC', []);
  return result.rows;
}

async function createWithdrawal(withdrawalData) {
  const {
    withdrawalId, memberId, amount, fee, netAmount, method, details
  } = withdrawalData;
  
  const result = await query(
    `INSERT INTO withdrawals (withdrawal_id, member_id, amount, fee, net_amount, method, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [withdrawalId, memberId, amount, fee, netAmount, method, details]
  );
  return result.rows[0];
}

// Referrals
async function getReferrals() {
  const result = await query('SELECT * FROM referrals ORDER BY created_at DESC', []);
  return result.rows;
}

async function createReferral(referralData) {
  const {
    referralId, referrerId, referrerName, referrerCode, referredId, referredName
  } = referralData;
  
  const result = await query(
    `INSERT INTO referrals (referral_id, referrer_id, referrer_name, referrer_code, referred_id, referred_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [referralId, referrerId, referrerName, referrerCode, referredId, referredName]
  );
  return result.rows[0];
}

// Transactions
async function createTransaction(transactionData) {
  const {
    transactionId, memberId, type, amount, description, adminId
  } = transactionData;
  
  const result = await query(
    `INSERT INTO transactions (transaction_id, member_id, type, amount, description, admin_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [transactionId, memberId, type, amount, description, adminId]
  );
  return result.rows[0];
}

async function getUserTransactions(memberId) {
  const result = await query(
    'SELECT * FROM transactions WHERE member_id = $1 ORDER BY date DESC LIMIT 50',
    [memberId]
  );
  return result.rows;
}

// Support chats
async function getSupportChats() {
  const result = await query('SELECT * FROM support_chats ORDER BY updated_at DESC', []);
  return result.rows;
}

async function createSupportChat(chatData) {
  const {
    chatId, userId, userName, userChatId, topic, messages, noAccount, isAppeal
  } = chatData;
  
  const result = await query(
    `INSERT INTO support_chats (chat_id, user_id, user_name, user_chat_id, topic, messages, no_account, is_appeal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [chatId, userId, userName, userChatId, topic, messages, noAccount, isAppeal]
  );
  return result.rows[0];
}

async function updateSupportChat(chatId, updates) {
  const setClause = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 2}`)
    .join(', ');
  
  const values = [chatId, ...Object.values(updates)];
  
  const result = await query(
    `UPDATE support_chats SET ${setClause} WHERE chat_id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

// Media files
async function storeMediaFile(mediaData) {
  const {
    mediaId, fileId, fileType, caption, chatId, investmentId, sender, senderId
  } = mediaData;
  
  const result = await query(
    `INSERT INTO media_files (media_id, file_id, file_type, caption, chat_id, investment_id, sender, sender_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [mediaId, fileId, fileType, caption, chatId, investmentId, sender, senderId]
  );
  return result.rows[0];
}

async function getMediaFile(mediaId) {
  const result = await query('SELECT * FROM media_files WHERE media_id = $1', [mediaId]);
  return result.rows[0] || null;
}

// Fake members
async function generateFakeMembers(count) {
  const names = ['John', 'Emma', 'Michael', 'Sophia', 'James', 'Olivia', 'Robert', 'Ava', 'David', 'Isabella'];
  
  for (let i = 1; i <= count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const investment = Math.floor(Math.random() * 500) + 50;
    const profit = investment * 0.02 * 7;
    const referrals = Math.floor(Math.random() * 5);
    const fakeMemberId = `FAKE-${1000 + i}`;
    
    await query(
      `INSERT INTO fake_members (fake_member_id, name, investment, profit, referrals)
       VALUES ($1, $2, $3, $4, $5)`,
      [fakeMemberId, `${name} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`, investment, profit, referrals]
    );
  }
}

async function getFakeMembers(limit = 50) {
  const result = await query('SELECT * FROM fake_members ORDER BY join_date DESC LIMIT $1', [limit]);
  return result.rows;
}

// ==================== HELPER FUNCTIONS (REMAIN THE SAME) ====================

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate random password
function generateRandomPassword(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Check if admin
function isAdmin(chatId) {
  const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
  return adminIds.includes(chatId.toString());
}

// Calculate daily profit (2% daily)
function calculateDailyProfit(investmentAmount) {
  return investmentAmount * 0.02;
}

// Calculate referral bonus (10% of referred user's FIRST investment)
function calculateReferralBonus(investmentAmount) {
  return investmentAmount * 0.10;
}

// Calculate withdrawal fee (5%)
function calculateWithdrawalFee(amount) {
  return amount * 0.05;
}

// Calculate net withdrawal amount after 5% fee
function calculateNetWithdrawal(amount) {
  const fee = calculateWithdrawalFee(amount);
  return amount - fee;
}

// Format currency
function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// Check if user is logged in
async function isUserLoggedIn(chatId) {
  if (loggedOutUsers.has(chatId.toString())) {
    return false;
  }
  
  const user = await getUserByChatId(chatId.toString());
  return !!user;
}

// Check if user is logged in AND not banned
async function canUserAccessAccount(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return false;
  }
  
  const user = await getUserByChatId(chatId.toString());
  
  if (!user) return false;
  if (user.banned) return false;
  
  return true;
}

// Get user data if logged in
async function getLoggedInUser(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return null;
  }
  
  const user = await getUserByChatId(chatId.toString());
  
  if (!user || user.banned) {
    return null;
  }
  
  return user;
}

// Check if Telegram account is already bound to a different user
async function isChatIdBoundToDifferentUser(chatId, requestedMemberId) {
  const user = await getUserByChatId(chatId.toString());
  
  if (!user) return false;
  return user.member_id !== requestedMemberId;
}

// Check if member ID is already bound to a different Telegram account
async function isMemberIdBoundToDifferentChat(memberId, chatId) {
  const user = await getUserByMemberId(memberId);
  
  if (!user || !user.chat_id) return false;
  return user.chat_id !== chatId.toString();
}

// Get active support chat for user
async function getActiveSupportChat(userId) {
  const result = await query(
    'SELECT * FROM support_chats WHERE (user_id = $1 OR user_id = $2) AND status = $3',
    [userId, `LOGGED_OUT_${userId}`, 'active']
  );
  return result.rows[0] || null;
}

// Send notification to user
async function sendUserNotification(memberId, message) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      console.log(`User ${memberId} not found`);
      return false;
    }
    
    if (!user.chat_id) {
      console.log(`User ${memberId} has no chat_id`);
      return false;
    }
    
    const isLoggedOut = loggedOutUsers.has(user.chat_id);
    
    try {
      await bot.sendMessage(user.chat_id, message);
      
      if (isLoggedOut) {
        await updateUser(memberId, {
          last_login: new Date().toISOString()
        });
        console.log(`Message sent to logged out user ${memberId}`);
      }
      
      return true;
    } catch (error) {
      console.log(`Could not send message to ${memberId}:`, error.message);
      
      if (error.response && error.response.statusCode === 403) {
        console.log(`User ${memberId} has blocked the bot`);
        await updateUser(memberId, { bot_blocked: true });
      }
      
      return false;
    }
  } catch (error) {
    console.log('Error in sendUserNotification:', error.message);
    return false;
  }
}

// Store message for user who can't receive it now
async function storeOfflineMessage(memberId, message, type = 'admin_message') {
  try {
    const user = await getUserByMemberId(memberId);
    if (!user) return false;
    
    const offlineMessages = user.offline_messages || [];
    offlineMessages.push({
      id: `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: type,
      message: message,
      timestamp: new Date().toISOString(),
      read: false
    });
    
    if (offlineMessages.length > 50) {
      offlineMessages = offlineMessages.slice(-50);
    }
    
    await updateUser(memberId, { offline_messages: offlineMessages });
    return true;
  } catch (error) {
    console.log('Error storing offline message:', error.message);
    return false;
  }
}

// Helper function to send direct message to user
async function sendDirectMessageToUser(adminChatId, memberId, messageText) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(adminChatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (user.bot_blocked) {
      await bot.sendMessage(adminChatId,
        `❌ **User has blocked the bot**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `Cannot send message. User needs to unblock the bot first.`
      );
      return;
    }
    
    const sent = await sendUserNotification(memberId,
      `📨 **Message from Starlife Advert Admin**\n\n` +
      `${messageText}\n\n` +
      `💼 Management Team`
    );
    
    if (sent) {
      await bot.sendMessage(adminChatId,
        `✅ **Message sent to ${user.name} (${memberId})**\n\n` +
        `Message: "${messageText}"`
      );
    } else {
      await storeOfflineMessage(memberId, 
        `📨 **Admin Message (Offline)**\n\n${messageText}\n\n💼 Management Team`,
        'admin_message'
      );
      
      await bot.sendMessage(adminChatId,
        `📨 **Message stored for offline user**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `User will see this message when they:\n` +
        `1. Login with /login\n` +
        `2. Or use /support\n\n` +
        `Message has been saved in their inbox.`
      );
    }
    
    // Record this message in support chats
    const supportChat = {
      chat_id: `ADMIN-MSG-${Date.now()}`,
      user_id: memberId,
      user_name: user.name,
      topic: 'Direct Admin Message',
      status: sent ? 'delivered' : 'stored_offline',
      messages: [{
        sender: 'admin',
        message: messageText,
        timestamp: new Date().toISOString(),
        adminId: adminChatId.toString()
      }],
      admin_replied: true,
      is_direct_message: true
    };
    
    await createSupportChat(supportChat);
    
  } catch (error) {
    console.log('Error sending direct message:', error.message);
    await bot.sendMessage(adminChatId,
      `❌ **Failed to send message**\n\n` +
      `Error: ${error.message}`
    );
  }
}

// Handle media files in support chats
async function handleSupportMedia(chatId, fileId, fileType, caption = '', session) {
  try {
    const supportChat = await query('SELECT * FROM support_chats WHERE chat_id = $1', [session.data.chatId]);
    
    if (!supportChat.rows[0]) {
      await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
      delete userSessions[chatId];
      return;
    }
    
    const mediaId = `MEDIA-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    await storeMediaFile({
      media_id: mediaId,
      file_id: fileId,
      file_type: fileType,
      caption: caption,
      chat_id: session.data.chatId,
      sender: session.data.memberId ? 'user' : 'anonymous',
      sender_id: session.data.memberId || `chat_${chatId}`
    });
    
    const chat = supportChat.rows[0];
    const messages = chat.messages || [];
    messages.push({
      sender: session.data.memberId ? 'user' : 'anonymous',
      message: caption || `[${fileType.toUpperCase()} sent]`,
      media_id: mediaId,
      file_type: fileType,
      timestamp: new Date().toISOString()
    });
    
    await updateSupportChat(session.data.chatId, {
      messages: messages,
      updated_at: new Date().toISOString(),
      admin_replied: false
    });
    
    await bot.sendMessage(chatId,
      `✅ **${fileType.charAt(0).toUpperCase() + fileType.slice(1)} sent to support!**\n\n` +
      `Your file has been received.\n` +
      `Support team will review it shortly.\n\n` +
      `Continue typing or send more files.`
    );
    
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0) {
      const userName = chat.user_name || 'Unknown User';
      const userId = chat.user_id || 'Anonymous';
      
      const adminMessage = `📎 **New Media in Support Chat**\n\n` +
                          `Chat ID: ${session.data.chatId}\n` +
                          `User: ${userName} (${userId})\n` +
                          `File Type: ${fileType.toUpperCase()}\n` +
                          `Caption: ${caption || 'No caption'}\n\n` +
                          `**Reply:** /replychat ${session.data.chatId} your_message\n` +
                          `**View Chat:** /viewchat ${session.data.chatId}`;
      
      for (const adminId of adminIds) {
        try {
          await bot.sendMessage(adminId, adminMessage);
        } catch (error) {
          console.log('Could not notify admin:', adminId);
        }
      }
    }
  } catch (error) {
    console.log('Error handling media:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending file. Please try again.');
  }
}

// Forward media to admin
async function forwardMediaToAdmin(adminChatId, mediaId) {
  try {
    const mediaFile = await getMediaFile(mediaId);
    if (!mediaFile) {
      await bot.sendMessage(adminChatId, '❌ Media file not found.');
      return false;
    }
    
    const fileId = mediaFile.file_id;
    const fileType = mediaFile.file_type;
    const caption = mediaFile.caption || '';
    
    switch(fileType) {
      case 'photo':
        await bot.sendPhoto(adminChatId, fileId, { caption: caption });
        break;
      case 'document':
        await bot.sendDocument(adminChatId, fileId, { caption: caption });
        break;
      case 'video':
        await bot.sendVideo(adminChatId, fileId, { caption: caption });
        break;
      default:
        await bot.sendMessage(adminChatId, `📎 Media file (${fileType}): ${caption || 'No caption'}`);
        break;
    }
    
    return true;
  } catch (error) {
    console.log('Error forwarding media:', error.message);
    await bot.sendMessage(adminChatId, `❌ Could not load media file: ${error.message}`);
    return false;
  }
}

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  try {
    await createTables();
    scheduleDailyProfits();
    console.log('✅ Bot system initialized successfully');
  } catch (error) {
    console.log('❌ Initialization error:', error.message);
  }
});

// Bot initialization
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.log('❌ ERROR: TELEGRAM_TOKEN is missing');
  console.log('Please set TELEGRAM_TOKEN environment variable');
  process.exit(1);
}

let bot;
try {
  bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: {
      interval: 300,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  });
  console.log('✅ Bot instance created');
} catch (error) {
  console.log('❌ Bot creation failed:', error.message);
  process.exit(1);
}

// User sessions
const userSessions = {};

// Logged out users
const loggedOutUsers = new Set();

// Admin sessions for messaging users
const adminSessions = {};

// Daily profit scheduler
async function calculateDailyProfitsForAll() {
  try {
    const investments = await query(
      'SELECT * FROM investments WHERE status = $1',
      ['active']
    );
    
    for (const investment of investments.rows) {
      const dailyProfit = calculateDailyProfit(investment.amount);
      
      const user = await getUserByMemberId(investment.member_id);
      if (user) {
        const newBalance = (parseFloat(user.balance) || 0) + dailyProfit;
        const newTotalEarned = (parseFloat(user.total_earned) || 0) + dailyProfit;
        
        await updateUser(investment.member_id, {
          balance: newBalance,
          total_earned: newTotalEarned
        });
        
        await createTransaction({
          transaction_id: `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          member_id: investment.member_id,
          type: 'daily_profit',
          amount: dailyProfit,
          description: `Daily profit from investment #${investment.investment_id}`
        });
      }
      
      const newTotalProfit = (parseFloat(investment.total_profit) || 0) + dailyProfit;
      await updateInvestment(investment.investment_id, {
        total_profit: newTotalProfit,
        days_active: investment.days_active + 1
      });
    }
    
    console.log('✅ Daily profits calculated for', investments.rows.length, 'investments');
  } catch (error) {
    console.log('❌ Error calculating daily profits:', error.message);
  }
}

function scheduleDailyProfits() {
  // Calculate profits immediately on startup
  calculateDailyProfitsForAll();
  
  // Schedule for every 24 hours
  setInterval(calculateDailyProfitsForAll, 24 * 60 * 60 * 1000);
}

// ==================== MEDIA HANDLERS (SAME LOGIC, UPDATED FOR POSTGRES) ====================

bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  if (session && session.step === 'awaiting_investment_proof') {
    try {
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const caption = msg.caption || '';
      
      const investmentId = `INV-${Date.now()}`;
      
      await createInvestment({
        investment_id: investmentId,
        member_id: session.data.memberId,
        amount: session.data.amount,
        payment_method: session.data.paymentMethod,
        transaction_hash: session.data.transactionHash || '',
        paypal_email: session.data.paypalEmail || '',
        proof_media_id: `MEDIA-${Date.now()}`,
        proof_caption: caption || `Payment proof for $${session.data.amount}`
      });
      
      await storeMediaFile({
        media_id: `MEDIA-${Date.now()}`,
        file_id: fileId,
        file_type: 'photo',
        caption: `Payment proof for ${formatCurrency(session.data.amount)} (Method: ${session.data.paymentMethod})`,
        investment_id: investmentId,
        sender: session.data.memberId,
        sender_id: session.data.memberId
      });
      
      const user = await getUserByMemberId(session.data.memberId);
      if (user) {
        await updateUser(session.data.memberId, {
          total_invested: (parseFloat(user.total_invested) || 0) + session.data.amount
        });
      }
      
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Payment Proof Received!**\n\n` +
        `Amount: ${formatCurrency(session.data.amount)}\n` +
        `Payment Method: ${session.data.paymentMethod}\n` +
        `Investment ID: ${investmentId}\n\n` +
        `Your investment is pending approval.\n` +
        `Our team will review your payment proof and activate your investment within 15 minutes.\n\n` +
        `You will be notified once it's approved.`
      );
      
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `📈 **New Investment Request**\n\n` +
                            `Investment ID: ${investmentId}\n` +
                            `User: ${user.name} (${session.data.memberId})\n` +
                            `Amount: ${formatCurrency(session.data.amount)}\n` +
                            `Payment Method: ${session.data.paymentMethod}\n` +
                            `Transaction Hash: ${session.data.transactionHash || 'N/A'}\n` +
                            `Date: ${new Date().toLocaleString()}\n\n` +
                            `**Approve:** /approveinvestment ${investmentId}\n` +
                            `**Reject:** /rejectinvestment ${investmentId}\n\n` +
                            `**View Proof:** /viewproof ${investmentId}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
      
      return;
    } catch (error) {
      console.log('Error handling investment photo:', error.message);
      await bot.sendMessage(chatId, '❌ Error sending payment proof. Please try again.');
    }
  }
  
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
    return;
  }
  
  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const caption = msg.caption || '';
    
    await handleSupportMedia(chatId, fileId, 'photo', caption, session);
  } catch (error) {
    console.log('Error handling photo:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending photo. Please try again.');
  }
});

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
    return;
  }
  
  try {
    const fileId = msg.document.file_id;
    const caption = msg.caption || '';
    const fileName = msg.document.file_name || 'document';
    
    await handleSupportMedia(chatId, fileId, 'document', `${fileName}\n${caption}`, session);
  } catch (error) {
    console.log('Error handling document:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending document. Please try again.');
  }
});

bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
    return;
  }
  
  try {
    const fileId = msg.video.file_id;
    const caption = msg.caption || '';
    
    await handleSupportMedia(chatId, fileId, 'video', caption, session);
  } catch (error) {
    console.log('Error handling video:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending video. Please try again.');
  }
});

bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
    return;
  }
  
  try {
    const fileId = msg.voice.file_id;
    
    await handleSupportMedia(chatId, fileId, 'voice', 'Voice message', session);
  } catch (error) {
    console.log('Error handling voice:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending voice message. Please try again.');
  }
});

// ==================== BOT COMMANDS (ALL COMMANDS REMAIN THE SAME LOGIC) ====================
// [All the bot command handlers from your original code remain the same,
//  but they now use the PostgreSQL functions instead of file operations]

// Example: Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log('📱 /start from:', chatId);
  
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    const user = await getUserByChatId(chatId.toString());
    
    if (user) {
      if (user.banned) {
        await bot.sendMessage(chatId,
          `🚫 **Account Suspended**\n\n` +
          `Your account has been suspended by admin.\n\n` +
          `**You can still:**\n` +
          `/appeal - Submit appeal\n` +
          `/support - Contact support\n\n` +
          `If you believe this is an error, please submit an appeal.`
        );
        return;
      }
      
      await updateUser(user.member_id, {
        last_login: new Date().toISOString()
      });
      
      const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                            `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                            `📈 Total Earned: ${formatCurrency(user.total_earned || 0)}\n` +
                            `👥 Referrals: ${user.referrals || 0}\n` +
                            `🔗 Your Code: ${user.referral_code}\n\n` +
                            `📋 **Quick Commands:**\n` +
                            `/invest - Make investment\n` +
                            `/earnings - View YOUR earnings\n` +
                            `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                            `/withdraw - Withdraw funds\n` +
                            `/referral - Share & earn 10% (FIRST investment only)\n` +
                            `/profile - Account details\n` +
                            `/transactions - View transaction history\n` +
                            `/support - Contact support\n` +
                            `/logout - Logout\n\n` +
                            `💳 **Payment Methods:**\n` +
                            `• M-Pesa Till: 6034186\n` +
                            `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                            `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                            `• PayPal: dave@starlifeadvert.com\n` +
                            `Name: Starlife Advert US Agency`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
  }
  
  const fakeMembers = await getFakeMembers(3);
  
  let fakeMessage = '🌟 **Recent Success Stories:**\n\n';
  fakeMembers.forEach(member => {
    fakeMessage += `✅ ${member.name} invested ${formatCurrency(member.investment)} & earned ${formatCurrency(member.profit)}\n`;
  });
  
  fakeMessage += '\n🚀 **Ready to Start Earning?**\n\n';
  fakeMessage += '💵 **Earn 2% Daily Profit**\n';
  fakeMessage += '👥 **Earn 10% from referrals (FIRST investment only)**\n';
  fakeMessage += '⚡ **Fast Withdrawals (10-15 min)**\n\n';
  fakeMessage += 'Choose an option:\n';
  fakeMessage += '/register - Create account\n';
  fakeMessage += '/login - Existing account\n';
  fakeMessage += '/investnow - Quick start guide\n';
  fakeMessage += '/support - Get help\n\n';
  fakeMessage += '💳 **Payment Methods:**\n';
  fakeMessage += '• M-Pesa Till: 6034186\n';
  fakeMessage += '• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n';
  fakeMessage += '• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n';
  fakeMessage += '• PayPal: dave@starlifeadvert.com\n';
  fakeMessage += 'Name: Starlife Advert US Agency';
  
  await bot.sendMessage(chatId, fakeMessage);
});

// ==================== ADMIN COMMANDS (UPDATED FOR POSTGRES) ====================

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  const adminMessage = `⚡ **ADMIN PANEL**\n\n` +
                      `📊 **Dashboard:**\n` +
                      `/stats - System statistics\n` +
                      `/admin - Show this menu\n\n` +
                      `👥 **User Management:**\n` +
                      `/users - List all users\n` +
                      `/view USER_ID - View user details\n` +
                      `/suspend USER_ID - Suspend user\n` +
                      `/unsuspend USER_ID - Unsuspend user\n` +
                      `/resetpass USER_ID - Reset password\n` +
                      `/delete USER_ID - Delete user\n` +
                      `/findref REF_CODE - Find user by referral code\n` +
                      `/message USER_ID - Message user directly\n` +
                      `/checkbinding USER_ID - Check Telegram binding\n\n` +
                      `💰 **Financial Management:**\n` +
                      `/addbalance USER_ID AMOUNT - Add balance\n` +
                      `/deductbalance USER_ID AMOUNT - Deduct balance\n\n` +
                      `📈 **Investment Management:**\n` +
                      `/investments - List all investments\n` +
                      `/approveinvestment INV_ID - Approve investment\n` +
                      `/rejectinvestment INV_ID - Reject investment\n` +
                      `/manualinv USER_ID AMOUNT - Add manual investment\n` +
                      `/deductinv USER_ID AMOUNT - Deduct investment amount\n` +
                      `/viewproof INV_ID - View payment proof\n\n` +
                      `💳 **Withdrawal Management:**\n` +
                      `/withdrawals - List withdrawals\n` +
                      `/approve WDL_ID - Approve withdrawal\n` +
                      `/reject WDL_ID - Reject withdrawal\n\n` +
                      `👥 **Referral Management:**\n` +
                      `/referrals - List all referrals\n` +
                      `/addrefbonus USER_ID AMOUNT - Add referral bonus\n\n` +
                      `🆘 **Support Management:**\n` +
                      `/supportchats - View active chats\n` +
                      `/viewchat CHAT_ID - View specific chat\n` +
                      `/viewmedia CHAT_ID - View media in chat\n` +
                      `/replychat CHAT_ID MESSAGE - Reply to chat\n` +
                      `/closechat CHAT_ID - Close chat\n\n` +
                      `📢 **Broadcast:**\n` +
                      `/broadcast MESSAGE - Send to all users`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// Stats command
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await getUsers();
    const investments = await getInvestments();
    const withdrawals = await getWithdrawals();
    const referrals = await getReferrals();
    const supportChats = await getSupportChats();
    const transactions = await query('SELECT COUNT(*) FROM transactions', []);
    const earningsViews = await query('SELECT COUNT(*) FROM earnings_views', []);
    const mediaFiles = await query('SELECT COUNT(*) FROM media_files', []);
    
    const totalBalance = users.reduce((sum, user) => sum + parseFloat(user.balance || 0), 0);
    const totalInvested = users.reduce((sum, user) => sum + parseFloat(user.total_invested || 0), 0);
    const totalEarned = users.reduce((sum, user) => sum + parseFloat(user.total_earned || 0), 0);
    const totalReferralEarnings = referrals.reduce((sum, ref) => sum + parseFloat(ref.bonus_amount || 0), 0);
    const activeUsers = users.filter(u => !u.banned).length;
    const activeInvestments = investments.filter(i => i.status === 'active').length;
    const pendingInvestments = investments.filter(i => i.status === 'pending').length;
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const activeSupportChats = supportChats.filter(c => c.status === 'active').length;
    const paidReferrals = referrals.filter(ref => ref.status === 'paid').length;
    const totalWithdrawalFees = withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + parseFloat(w.fee || 0), 0);
    const offlineUsers = users.filter(u => u.chat_id && loggedOutUsers.has(u.chat_id)).length;
    const blockedUsers = users.filter(u => u.bot_blocked).length;
    const suspendedUsers = users.filter(u => u.banned).length;
    const boundAccounts = users.filter(u => u.account_bound).length;
    
    const statsMessage = `📊 **System Statistics**\n\n` +
                        `**Users:**\n` +
                        `• Total Users: ${users.length}\n` +
                        `• Active Users: ${activeUsers}\n` +
                        `• Suspended Users: ${suspendedUsers}\n` +
                        `• Logged Out: ${offlineUsers}\n` +
                        `• Blocked Bot: ${blockedUsers}\n` +
                        `• Telegram Bound: ${boundAccounts}\n` +
                        `• Total Balance: ${formatCurrency(totalBalance)}\n\n` +
                        `**Investments:**\n` +
                        `• Total Investments: ${investments.length}\n` +
                        `• Active Investments: ${activeInvestments}\n` +
                        `• Pending Investments: ${pendingInvestments}\n` +
                        `• Total Invested: ${formatCurrency(totalInvested)}\n` +
                        `• Total Earned: ${formatCurrency(totalEarned)}\n\n` +
                        `**Withdrawals:**\n` +
                        `• Total Withdrawals: ${withdrawals.length}\n` +
                        `• Pending Withdrawals: ${pendingWithdrawals}\n` +
                        `• Total Withdrawn: ${formatCurrency(withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + parseFloat(w.amount), 0))}\n` +
                        `• Total Fees Collected: ${formatCurrency(totalWithdrawalFees)}\n\n` +
                        `**Referrals:**\n` +
                        `• Total Referrals: ${referrals.length}\n` +
                        `• Paid Referrals: ${paidReferrals}\n` +
                        `• Total Bonus Paid: ${formatCurrency(totalReferralEarnings)}\n\n` +
                        `**Earnings Views:**\n` +
                        `• Total Views: ${earningsViews.rows[0].count}\n\n` +
                        `**Transactions:**\n` +
                        `• Total Transactions: ${transactions.rows[0].count}\n\n` +
                        `**Support:**\n` +
                        `• Active Chats: ${activeSupportChats}\n` +
                        `• Total Chats: ${supportChats.length}\n` +
                        `• Media Files: ${mediaFiles.rows[0].count}`;
    
    await bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.log('Error in /stats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading statistics.');
  }
});

// ==================== REMAINING COMMANDS ====================
// [All other commands from your original code should be updated similarly
//  to use the PostgreSQL functions instead of file operations]

// Health endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: 'connected',
      users: Object.keys(userSessions).length,
      loggedOutUsers: loggedOutUsers.size,
      adminSessions: Object.keys(adminSessions).length
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.send('Starlife Advert Bot is running with PostgreSQL!');
});

// ==================== ERROR HANDLING ====================

bot.on('polling_error', (error) => {
  console.log('Polling error:', error.message);
});

bot.on('webhook_error', (error) => {
  console.log('Webhook error:', error.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await pool.end();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('✅ Starlife Advert Bot with PostgreSQL is running!');
console.log('✅ Data will be preserved permanently on Heroku Postgres');
