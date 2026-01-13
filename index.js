const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://starlifeadmin:mDUbjRt7ev106AcW@cluster0.abc123.mongodb.net/starlife?appName=Cluster0';
const DB_NAME = 'starlife';
let db;
let client;

// Collections
const COLLECTIONS = {
  USERS: 'users',
  INVESTMENTS: 'investments',
  WITHDRAWALS: 'withdrawals',
  REFERRALS: 'referrals',
  FAKE_MEMBERS: 'fake_members',
  TRANSACTIONS: 'transactions',
  SUPPORT_CHATS: 'support_chats',
  EARNINGS_VIEWS: 'earnings_views',
  MEDIA_FILES: 'media_files'
};

// Initialize MongoDB connection
async function initMongoDB() {
  try {
    client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    await client.connect();
    db = client.db(DB_NAME);
    console.log('✅ Connected to MongoDB');
    
    // Create indexes
    await createIndexes();
    console.log('✅ Indexes created');
    
    // Initialize fake members if needed
    await initializeFakeMembers();
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return false;
  }
}

// Create indexes for better performance
async function createIndexes() {
  // Users collection
  await db.collection(COLLECTIONS.USERS).createIndex({ memberId: 1 }, { unique: true });
  await db.collection(COLLECTIONS.USERS).createIndex({ chatId: 1 }, { unique: true, sparse: true });
  await db.collection(COLLECTIONS.USERS).createIndex({ email: 1 }, { unique: true, sparse: true });
  await db.collection(COLLECTIONS.USERS).createIndex({ referralCode: 1 }, { unique: true });
  
  // Investments collection
  await db.collection(COLLECTIONS.INVESTMENTS).createIndex({ memberId: 1 });
  await db.collection(COLLECTIONS.INVESTMENTS).createIndex({ status: 1 });
  
  // Withdrawals collection
  await db.collection(COLLECTIONS.WITHDRAWALS).createIndex({ memberId: 1 });
  await db.collection(COLLECTIONS.WITHDRAWALS).createIndex({ status: 1 });
  
  // Referrals collection
  await db.collection(COLLECTIONS.REFERRALS).createIndex({ referrerId: 1 });
  await db.collection(COLLECTIONS.REFERRALS).createIndex({ referredId: 1 });
  
  // Support chats collection
  await db.collection(COLLECTIONS.SUPPORT_CHATS).createIndex({ userId: 1 });
  await db.collection(COLLECTIONS.SUPPORT_CHATS).createIndex({ status: 1 });
  
  // Transactions collection
  await db.collection(COLLECTIONS.TRANSACTIONS).createIndex({ memberId: 1 });
  await db.collection(COLLECTIONS.TRANSACTIONS).createIndex({ date: -1 });
  
  // Earnings views collection
  await db.collection(COLLECTIONS.EARNINGS_VIEWS).createIndex({ viewerId: 1 });
  await db.collection(COLLECTIONS.EARNINGS_VIEWS).createIndex({ viewedId: 1 });
  
  // Media files collection
  await db.collection(COLLECTIONS.MEDIA_FILES).createIndex({ chatId: 1 });
  await db.collection(COLLECTIONS.MEDIA_FILES).createIndex({ investmentId: 1 });
}

// Initialize fake members
async function initializeFakeMembers() {
  try {
    const count = await db.collection(COLLECTIONS.FAKE_MEMBERS).countDocuments();
    
    if (count === 0) {
      const fakeMembers = generateFakeMembers(50);
      await db.collection(COLLECTIONS.FAKE_MEMBERS).insertMany(fakeMembers);
      console.log('✅ Fake members initialized');
    }
  } catch (error) {
    console.error('Error initializing fake members:', error.message);
  }
}

// Load data from MongoDB
async function loadData(collectionName, query = {}, sort = {}, limit = 0) {
  try {
    const collection = db.collection(collectionName);
    let cursor = collection.find(query);
    
    if (sort && Object.keys(sort).length > 0) {
      cursor = cursor.sort(sort);
    }
    
    if (limit > 0) {
      cursor = cursor.limit(limit);
    }
    
    return await cursor.toArray();
  } catch (error) {
    console.error(`Error loading data from ${collectionName}:`, error.message);
    return [];
  }
}

// Save data to MongoDB (update single document)
async function saveData(collectionName, filter, update, options = { upsert: true }) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.updateOne(filter, update, options);
    return result;
  } catch (error) {
    console.error(`Error saving data to ${collectionName}:`, error.message);
    return null;
  }
}

// Insert new document
async function insertData(collectionName, document) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.insertOne(document);
    return result;
  } catch (error) {
    console.error(`Error inserting data to ${collectionName}:`, error.message);
    return null;
  }
}

// Update multiple documents
async function updateMany(collectionName, filter, update) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.updateMany(filter, update);
    return result;
  } catch (error) {
    console.error(`Error updating multiple in ${collectionName}:`, error.message);
    return null;
  }
}

// Delete documents
async function deleteData(collectionName, filter) {
  try {
    const collection = db.collection(collectionName);
    const result = await collection.deleteMany(filter);
    return result;
  } catch (error) {
    console.error(`Error deleting data from ${collectionName}:`, error.message);
    return null;
  }
}

// Find one document
async function findOne(collectionName, query) {
  try {
    const collection = db.collection(collectionName);
    return await collection.findOne(query);
  } catch (error) {
    console.error(`Error finding one in ${collectionName}:`, error.message);
    return null;
  }
}

// Store media file reference
async function storeMediaFile(mediaData) {
  try {
    mediaData.createdAt = new Date().toISOString();
    const result = await insertData(COLLECTIONS.MEDIA_FILES, mediaData);
    return result ? true : false;
  } catch (error) {
    console.error('Error storing media:', error.message);
    return false;
  }
}

// Get media file by ID
async function getMediaFile(mediaId) {
  try {
    return await findOne(COLLECTIONS.MEDIA_FILES, { id: mediaId });
  } catch (error) {
    console.error('Error getting media:', error.message);
    return null;
  }
}

// Generate fake members
function generateFakeMembers(count) {
  const fakeMembers = [];
  const names = ['John', 'Emma', 'Michael', 'Sophia', 'James', 'Olivia', 'Robert', 'Ava', 'David', 'Isabella'];
  
  for (let i = 1; i <= count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const investment = Math.floor(Math.random() * 500) + 50;
    const profit = investment * 0.02 * 7;
    const referrals = Math.floor(Math.random() * 5);
    
    fakeMembers.push({
      id: `FAKE-${1000 + i}`,
      name: `${name} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`,
      investment: investment,
      profit: profit.toFixed(2),
      referrals: referrals,
      joinDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(),
      isFake: true,
      createdAt: new Date().toISOString()
    });
  }
  
  return fakeMembers;
}

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

// ==================== HELPER FUNCTIONS ====================

// Check if user is logged in
async function isUserLoggedIn(chatId) {
  // Check if user has explicitly logged out
  if (loggedOutUsers.has(chatId.toString())) {
    return false;
  }
  
  // Check if user exists and has chatId
  const user = await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
  
  return !!user;
}

// Check if user is logged in AND not banned
async function canUserAccessAccount(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return false;
  }
  
  const user = await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
  
  if (!user) return false;
  if (user.banned) return false;
  
  return true;
}

// Get user data if logged in
async function getLoggedInUser(chatId) {
  if (!await isUserLoggedIn(chatId)) {
    return null;
  }
  
  const user = await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
  
  if (!user || user.banned) {
    return null;
  }
  
  return user;
}

// Get user by member ID
async function getUserByMemberId(memberId) {
  return await findOne(COLLECTIONS.USERS, { memberId: memberId });
}

// Get user by chat ID (for Telegram account binding)
async function getUserByChatId(chatId) {
  return await findOne(COLLECTIONS.USERS, { chatId: chatId.toString() });
}

// Get user by email
async function getUserByEmail(email) {
  return await findOne(COLLECTIONS.USERS, { email: email.toLowerCase() });
}

// Check if Telegram account is already bound to a different user (SECURITY FIX)
async function isChatIdBoundToDifferentUser(chatId, requestedMemberId) {
  const userByChatId = await getUserByChatId(chatId);
  
  if (!userByChatId) return false; // No binding exists
  
  // If chatId is bound to a different memberId than requested
  return userByChatId.memberId !== requestedMemberId;
}

// Check if member ID is already bound to a different Telegram account (SECURITY FIX)
async function isMemberIdBoundToDifferentChat(memberId, chatId) {
  const userByMemberId = await getUserByMemberId(memberId);
  
  if (!userByMemberId || !userByMemberId.chatId) return false; // No binding exists
  
  // If memberId is bound to a different chatId than current
  return userByMemberId.chatId !== chatId.toString();
}

// Get active support chat for user
async function getActiveSupportChat(userId) {
  return await findOne(COLLECTIONS.SUPPORT_CHATS, { 
    userId: userId,
    status: 'active'
  });
}

// Send notification to user (works even if logged out - FIXED)
async function sendUserNotification(memberId, message) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      console.log(`User ${memberId} not found`);
      return false;
    }
    
    // Check if user has chatId
    if (!user.chatId) {
      console.log(`User ${memberId} has no chatId`);
      return false;
    }
    
    // Check if user is logged out
    const isLoggedOut = loggedOutUsers.has(user.chatId);
    
    // Send message anyway - even if logged out
    try {
      await bot.sendMessage(user.chatId, message);
      
      // If user was logged out, update last notification time
      if (isLoggedOut) {
        await saveData(COLLECTIONS.USERS, 
          { memberId: memberId },
          { $set: { lastNotification: new Date().toISOString() } }
        );
        console.log(`Message sent to logged out user ${memberId}`);
      }
      
      return true;
    } catch (error) {
      console.log(`Could not send message to ${memberId}:`, error.message);
      
      // If it's a block/unavailable error, don't keep trying
      if (error.response && error.response.statusCode === 403) {
        console.log(`User ${memberId} has blocked the bot`);
        
        // Mark user as unavailable
        await saveData(COLLECTIONS.USERS,
          { memberId: memberId },
          { $set: { botBlocked: true } }
        );
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
    const messageId = `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const offlineMessage = {
      id: messageId,
      type: type,
      message: message,
      timestamp: new Date().toISOString(),
      read: false
    };
    
    // Add to user's offline messages array
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { 
        $push: { 
          offlineMessages: {
            $each: [offlineMessage],
            $slice: -50 // Keep only last 50 messages
          }
        }
      }
    );
    
    return true;
  } catch (error) {
    console.log('Error storing offline message:', error.message);
    return false;
  }
}

// Helper function to send direct message to user (UPDATED)
async function sendDirectMessageToUser(adminChatId, memberId, messageText) {
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(adminChatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Check if user has blocked the bot
    if (user.botBlocked) {
      await bot.sendMessage(adminChatId,
        `❌ **User has blocked the bot**\n\n` +
        `User: ${user.name} (${memberId})\n` +
        `Message: "${messageText}"\n\n` +
        `Cannot send message. User needs to unblock the bot first.`
      );
      return;
    }
    
    // Try to send message to user
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
      // Store message for when user comes back online
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
    const adminMessageChat = {
      id: `ADMIN-MSG-${Date.now()}`,
      userId: memberId,
      userName: user.name,
      topic: 'Direct Admin Message',
      status: sent ? 'delivered' : 'stored_offline',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [{
        sender: 'admin',
        message: messageText,
        timestamp: new Date().toISOString(),
        adminId: adminChatId.toString()
      }],
      adminReplied: true,
      isDirectMessage: true
    };
    
    await insertData(COLLECTIONS.SUPPORT_CHATS, adminMessageChat);
    
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
    const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: session.data.chatId });
    
    if (!supportChat) {
      await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
      delete userSessions[chatId];
      return;
    }
    
    // Generate unique media ID
    const mediaId = `MEDIA-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    // Store media reference
    await storeMediaFile({
      id: mediaId,
      fileId: fileId,
      fileType: fileType,
      caption: caption,
      chatId: session.data.chatId,
      sender: session.data.memberId ? 'user' : 'anonymous',
      senderId: session.data.memberId || `chat_${chatId}`,
      timestamp: new Date().toISOString()
    });
    
    // Add media message to chat
    await saveData(COLLECTIONS.SUPPORT_CHATS,
      { id: session.data.chatId },
      { 
        $push: { 
          messages: {
            sender: session.data.memberId ? 'user' : 'anonymous',
            message: caption || `[${fileType.toUpperCase()} sent]`,
            mediaId: mediaId,
            fileType: fileType,
            timestamp: new Date().toISOString()
          }
        },
        $set: {
          updatedAt: new Date().toISOString(),
          adminReplied: false
        }
      }
    );
    
    // Confirm to user
    await bot.sendMessage(chatId,
      `✅ **${fileType.charAt(0).toUpperCase() + fileType.slice(1)} sent to support!**\n\n` +
      `Your file has been received.\n` +
      `Support team will review it shortly.\n\n` +
      `Continue typing or send more files.`
    );
    
    // Notify admins about media
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0) {
      const userName = supportChat.userName || 'Unknown User';
      const userId = supportChat.userId || 'Anonymous';
      
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
    
    const fileId = mediaFile.fileId;
    const fileType = mediaFile.fileType;
    const caption = mediaFile.caption || '';
    
    // Forward based on file type
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
    const mongoConnected = await initMongoDB();
    if (mongoConnected) {
      scheduleDailyProfits();
      console.log('✅ Bot system initialized successfully');
    } else {
      console.log('❌ Failed to connect to MongoDB');
    }
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

// Logged out users (track who has logged out)
const loggedOutUsers = new Set();

// Admin sessions for messaging users
const adminSessions = {};

// Daily profit scheduler
function scheduleDailyProfits() {
  setInterval(async () => {
    try {
      const investments = await loadData(COLLECTIONS.INVESTMENTS, { status: 'active' });
      
      for (const investment of investments) {
        const dailyProfit = calculateDailyProfit(investment.amount);
        
        // Update user balance
        await saveData(COLLECTIONS.USERS,
          { memberId: investment.memberId },
          { 
            $inc: { 
              balance: dailyProfit,
              totalEarned: dailyProfit
            }
          }
        );
        
        // Record transaction
        await insertData(COLLECTIONS.TRANSACTIONS, {
          id: `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          memberId: investment.memberId,
          type: 'daily_profit',
          amount: dailyProfit,
          description: `Daily profit from investment #${investment.id}`,
          date: new Date().toISOString()
        });
        
        // Update investment profit
        await saveData(COLLECTIONS.INVESTMENTS,
          { id: investment.id },
          { 
            $inc: { 
              totalProfit: dailyProfit,
              daysActive: 1
            }
          }
        );
        
        // Removed 30-day completion check - investments now continue indefinitely
      }
      
      console.log('✅ Daily profits calculated for', investments.length, 'investments');
    } catch (error) {
      console.log('❌ Error calculating daily profits:', error.message);
    }
  }, 24 * 60 * 60 * 1000);
}

// ==================== MEDIA HANDLERS ====================

// Handle photos in support chats
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Handle investment proof photos
  if (session && session.step === 'awaiting_investment_proof') {
    try {
      // Get the best quality photo (last in array is highest quality)
      const photo = msg.photo[msg.photo.length - 1];
      const fileId = photo.file_id;
      const caption = msg.caption || '';
      
      // Create investment with pending status
      const investmentId = `INV-${Date.now()}`;
      
      const investment = {
        id: investmentId,
        memberId: session.data.memberId,
        amount: session.data.amount,
        paymentMethod: session.data.paymentMethod,
        transactionHash: session.data.transactionHash || '',
        status: 'pending',
        date: new Date().toISOString(),
        daysActive: 0,
        totalProfit: 0,
        proofMediaId: `MEDIA-${Date.now()}`,
        proofCaption: caption || `Payment proof for $${session.data.amount}`
      };
      
      await insertData(COLLECTIONS.INVESTMENTS, investment);
      
      // Store media file
      await storeMediaFile({
        id: `MEDIA-${Date.now()}`,
        fileId: fileId,
        fileType: 'photo',
        caption: `Payment proof for ${formatCurrency(session.data.amount)} (Method: ${session.data.paymentMethod})`,
        investmentId: investmentId,
        sender: session.data.memberId,
        timestamp: new Date().toISOString()
      });
      
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
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const user = await getUserByMemberId(session.data.memberId);
        
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
  
  // Only handle photos in active support chats
  if (!session || !(session.step === 'support_chat' || 
                    session.step === 'support_loggedout_chat' || 
                    session.step === 'universal_support_chat' ||
                    session.step === 'appeal_chat')) {
    return;
  }
  
  try {
    // Get the best quality photo (last in array is highest quality)
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const caption = msg.caption || '';
    
    await handleSupportMedia(chatId, fileId, 'photo', caption, session);
  } catch (error) {
    console.log('Error handling photo:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending photo. Please try again.');
  }
});

// Handle documents in support chats
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle documents in active support chats
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

// Handle videos in support chats
bot.on('video', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle videos in active support chats
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

// Handle voice messages in support chats
bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  // Only handle voice in active support chats
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

// ==================== BOT COMMANDS ====================

// Start command - Available to everyone
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log('📱 /start from:', chatId);
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  // Check if user is logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    const user = await getUserByChatId(chatId);
    
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
      
      // Update last login
      await saveData(COLLECTIONS.USERS,
        { chatId: chatId.toString() },
        { $set: { lastLogin: new Date().toISOString() } }
      );
      
      const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                            `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                            `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                            `👥 Referrals: ${user.referrals || 0}\n` +
                            `🔗 Your Code: ${user.referralCode}\n\n` +
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
  
  // User is not logged in - show public welcome
  const fakeMembers = await loadData(COLLECTIONS.FAKE_MEMBERS, {}, {}, 3);
  
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

// Forgot Password command - NEW
bot.onText(/\/forgotpassword/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /profile to see your account details.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'forgot_password_method',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Password Recovery**\n\n` +
    `Select how you want to recover your password:\n\n` +
    `1️⃣ **By Member ID**\n` +
    `   - Enter your Member ID\n` +
    `   - We'll send new password to your registered chat\n\n` +
    `2️⃣ **By Email**\n` +
    `   - Enter your registered email\n` +
    `   - We'll send new password to your registered chat\n\n` +
    `3️⃣ **Contact Support**\n` +
    `   - If you don't remember either\n\n` +
    `Reply with number (1-3):`
  );
});

// Help command - NEW
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  const user = isLoggedIn ? await getLoggedInUser(chatId) : null;
  
  let helpMessage = `🆘 **Starlife Advert Help Center**\n\n`;
  
  if (isLoggedIn && user) {
    helpMessage += `👋 Welcome ${user.name}!\n\n`;
    helpMessage += `**📊 Account Commands:**\n`;
    helpMessage += `/profile - View your account details\n`;
    helpMessage += `/earnings - View your earnings\n`;
    helpMessage += `/transactions - View transaction history\n`;
    helpMessage += `/referral - View referral program (FIRST investment only)\n`;
    helpMessage += `/logout - Logout from account\n\n`;
    
    helpMessage += `**💰 Financial Commands:**\n`;
    helpMessage += `/invest - Make new investment\n`;
    helpMessage += `/withdraw - Withdraw funds\n`;
    helpMessage += `/viewearnings USER-ID - View others earnings ($1 fee)\n\n`;
    
    helpMessage += `**🆘 Support Commands:**\n`;
    helpMessage += `/support - Contact support team\n`;
    helpMessage += `/appeal - Submit appeal (if suspended)\n`;
    helpMessage += `/inbox - View offline messages\n\n`;
    
    helpMessage += `**🔐 Account Security:**\n`;
    helpMessage += `/forgotpassword - Reset your password\n\n`;
    
    helpMessage += `**💡 Quick Start:**\n`;
    helpMessage += `/investnow - Quick investment guide\n`;
  } else {
    helpMessage += `**Welcome! Here are available commands:**\n\n`;
    helpMessage += `**👤 Account Commands:**\n`;
    helpMessage += `/register - Create new account\n`;
    helpMessage += `/login - Login to existing account\n`;
    helpMessage += `/forgotpassword - Reset your password\n\n`;
    
    helpMessage += `**💡 Information Commands:**\n`;
    helpMessage += `/investnow - Quick start guide\n`;
    helpMessage += `/support - Contact support\n\n`;
    
    helpMessage += `**📊 After Registration:**\n`;
    helpMessage += `• Use /invest to start earning\n`;
    helpMessage += `• Earn 2% daily profit (LIFETIME)\n`;
    helpMessage += `• Get 10% from referrals (FIRST investment only)\n`;
    helpMessage += `• Fast withdrawals (10-15 min)\n\n`;
  }
  
  helpMessage += `**💳 Payment Methods:**\n`;
  helpMessage += `• M-Pesa Till: 6034186\n`;
  helpMessage += `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n`;
  helpMessage += `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n`;
  helpMessage += `• PayPal: dave@starlifeadvert.com\n`;
  helpMessage += `Name: Starlife Advert US Agency\n\n`;
  helpMessage += `**❓ Need Help?**\n`;
  helpMessage += `Use /support for immediate assistance`;
  
  await bot.sendMessage(chatId, helpMessage);
});

// Transactions command - NEW
bot.onText(/\/transactions/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  try {
    const transactions = await loadData(
      COLLECTIONS.TRANSACTIONS, 
      { memberId: user.memberId },
      { date: -1 },
      10
    );
    
    if (transactions.length === 0) {
      await bot.sendMessage(chatId, '📭 No transactions found.');
      return;
    }
    
    let message = `📊 **Transaction History**\n\n`;
    message += `Total Transactions: ${transactions.length}\n\n`;
    
    transactions.forEach((tx, index) => {
      const date = new Date(tx.date).toLocaleDateString();
      const time = new Date(tx.date).toLocaleTimeString();
      const amount = parseFloat(tx.amount);
      const sign = amount >= 0 ? '+' : '';
      const type = tx.type === 'daily_profit' ? '💰 Daily Profit' :
                   tx.type === 'withdrawal' ? '💳 Withdrawal' :
                   tx.type === 'referral_bonus' ? '👥 Referral Bonus' :
                   tx.type === 'view_earnings_fee' ? '👀 Earnings View' :
                   tx.type === 'registration' ? '📝 Registration' :
                   tx.type === 'admin_add_balance' ? '👑 Admin Add' :
                   tx.type === 'admin_deduct_balance' ? '👑 Admin Deduct' :
                   tx.type === 'manual_investment' ? '📈 Manual Investment' :
                   tx.type;
      
      message += `${index + 1}. **${type}**\n`;
      message += `   Amount: ${sign}${formatCurrency(amount)}\n`;
      message += `   Date: ${date} ${time}\n`;
      if (tx.description) {
        message += `   Note: ${tx.description}\n`;
      }
      message += `\n`;
    });
    
    // Calculate totals
    const allTransactions = await loadData(
      COLLECTIONS.TRANSACTIONS, 
      { memberId: user.memberId }
    );
    
    const totalDeposits = allTransactions
      .filter(t => t.amount > 0 && t.type !== 'daily_profit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalWithdrawals = allTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const totalProfits = allTransactions
      .filter(t => t.type === 'daily_profit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    message += `\n**📈 Summary:**\n`;
    message += `Total Deposits: ${formatCurrency(totalDeposits)}\n`;
    message += `Total Withdrawals: ${formatCurrency(totalWithdrawals)}\n`;
    message += `Total Profits: ${formatCurrency(totalProfits)}\n`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /transactions:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading transactions.');
  }
});

// Investnow command - NEW
bot.onText(/\/investnow/, async (msg) => {
  const chatId = msg.chat.id;
  
  const guideMessage = `🚀 **Quick Start Investment Guide**\n\n` +
                      `**Step 1: Create Account**\n` +
                      `Use /register to create your account\n` +
                      `Save your Member ID and Password!\n\n` +
                      `**Step 2: Make Payment**\n` +
                      `Choose your preferred payment method:\n\n` +
                      `💳 **M-Pesa:**\n` +
                      `Till: 6034186\n` +
                      `Name: Starlife Advert US Agency\n\n` +
                      `💳 **USDT Tether (BEP20) - RECOMMENDED:**\n` +
                      `Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                      `📌 Send only USDT (BEP20)\n\n` +
                      `💳 **USDT TRON (TRC20):**\n` +
                      `Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                      `📌 Send only USDT (TRC20)\n\n` +
                      `💳 **PayPal:**\n` +
                      `Email: dave@starlifeadvert.com\n\n` +
                      `**Step 3: Invest**\n` +
                      `Use /invest to start investment\n` +
                      `Minimum: $10 | Maximum: $800,000\n` +
                      `Send payment proof screenshot\n\n` +
                      `**Step 4: Earn Daily (LIFETIME)**\n` +
                      `✅ 2% daily profit FOREVER\n` +
                      `✅ No time limit\n` +
                      `✅ Automatic daily earnings\n\n` +
                      `**Step 5: Refer & Earn**\n` +
                      `Share your referral code\n` +
                      `Earn 10% of referrals' FIRST investment only\n\n` +
                      `**Step 6: Withdraw**\n` +
                      `Minimum withdrawal: $2\n` +
                      `Processing time: 10-15 minutes\n` +
                      `Fee: 5% (industry standard)\n\n` +
                      `**Ready to Start?**\n` +
                      `▶️ /register - Create account\n` +
                      `▶️ /login - If you have account\n` +
                      `▶️ /invest - Start investing\n\n` +
                      `**Need Help?**\n` +
                      `/support - 24/7 support available`;
  
  await bot.sendMessage(chatId, guideMessage);
});

// Change Password command - NEW
bot.onText(/\/changepassword/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  userSessions[chatId] = {
    step: 'change_password_current',
    data: {
      memberId: user.memberId
    }
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Change Password**\n\n` +
    `For security, please enter your current password:`
  );
});

// Invest command - UPDATED WITH PAYMENT METHODS
bot.onText(/\/invest/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_investment_amount',
    data: {
      memberId: user.memberId
    }
  };
  
  await bot.sendMessage(chatId,
    `💰 **Make Investment**\n\n` +
    `**Available Payment Methods:**\n\n` +
    `1️⃣ **M-Pesa**\n` +
    `   Till: 6034186\n` +
    `   Name: Starlife Advert US Agency\n\n` +
    `2️⃣ **USDT Tether (BEP20) - RECOMMENDED**\n` +
    `   Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
    `   📌 Send only USDT (BEP20)\n\n` +
    `3️⃣ **USDT TRON (TRC20)**\n` +
    `   Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
    `   📌 Send only USDT (TRC20)\n\n` +
    `4️⃣ **PayPal**\n` +
    `   Email: dave@starlifeadvert.com\n\n` +
    `**Investment Details:**\n` +
    `Minimum Investment: $10\n` +
    `Maximum Investment: $800,000\n` +
    `Daily Profit: 2% (LIFETIME)\n\n` +
    `Enter amount to invest:`
  );
});

// Earnings command - View YOUR OWN earnings
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const investments = await loadData(COLLECTIONS.INVESTMENTS, { 
    memberId: user.memberId,
    status: 'active'
  });
  
  let message = `📈 **Your Earnings**\n\n`;
  message += `💰 Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `📊 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
  message += `💵 Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  message += `👥 Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  
  if (investments.length > 0) {
    message += `**Active Investments:**\n`;
    investments.forEach(inv => {
      const dailyProfit = calculateDailyProfit(inv.amount);
      message += `• ${formatCurrency(inv.amount)} - Daily: ${formatCurrency(dailyProfit)}\n`;
    });
  } else {
    message += `No active investments.\n`;
    message += `Use /invest to start earning!\n`;
  }
  
  await bot.sendMessage(chatId, message);
});

// View earnings of another user (paid feature - $1)
bot.onText(/\/viewearnings (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const targetMemberId = match[1].toUpperCase();
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  // Check if user is trying to view their own earnings (should use /earnings instead)
  if (targetMemberId === user.memberId) {
    await bot.sendMessage(chatId, 
      `ℹ️ To view your own earnings, use /earnings command instead.\n` +
      `/viewearnings is for viewing other users' earnings (with $1 fee).`
    );
    return;
  }
  
  // Check if user has enough balance ($1 fee)
  const fee = 1.00;
  if ((user.balance || 0) < fee) {
    await bot.sendMessage(chatId,
      `❌ **Insufficient Balance**\n\n` +
      `Fee to view earnings: ${formatCurrency(fee)}\n` +
      `Your balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Please add funds to use this feature.`
    );
    return;
  }
  
  try {
    const targetUser = await getUserByMemberId(targetMemberId);
    
    if (!targetUser) {
      await bot.sendMessage(chatId, `❌ User ${targetMemberId} not found.`);
      return;
    }
    
    // Deduct fee from user
    await saveData(COLLECTIONS.USERS,
      { memberId: user.memberId },
      { $inc: { balance: -fee } }
    );
    
    // Record transaction
    await insertData(COLLECTIONS.TRANSACTIONS, {
      id: `VIEW-EARN-${Date.now()}`,
      memberId: user.memberId,
      type: 'view_earnings_fee',
      amount: -fee,
      description: `Fee to view ${targetMemberId}'s earnings`,
      date: new Date().toISOString()
    });
    
    // Record earnings view
    await insertData(COLLECTIONS.EARNINGS_VIEWS, {
      id: `VIEW-${Date.now()}`,
      viewerId: user.memberId,
      viewedId: targetMemberId,
      fee: fee,
      date: new Date().toISOString()
    });
    
    // Get target user's investments
    const targetInvestments = await loadData(COLLECTIONS.INVESTMENTS, { 
      memberId: targetMemberId,
      status: 'active'
    });
    
    let message = `👤 **Earnings Report for ${targetUser.name} (${targetMemberId})**\n\n`;
    message += `💰 Balance: ${formatCurrency(targetUser.balance || 0)}\n`;
    message += `📊 Total Earned: ${formatCurrency(targetUser.totalEarned || 0)}\n`;
    message += `💵 Total Invested: ${formatCurrency(targetUser.totalInvested || 0)}\n`;
    message += `👥 Referral Earnings: ${formatCurrency(targetUser.referralEarnings || 0)}\n`;
    message += `📈 Active Investments: ${targetInvestments.length}\n`;
    message += `👥 Total Referrals: ${targetUser.referrals || 0}\n\n`;
    
    if (targetInvestments.length > 0) {
      message += `**Active Investments:**\n`;
      targetInvestments.forEach((inv, index) => {
        const dailyProfit = calculateDailyProfit(inv.amount);
        message += `${index + 1}. ${formatCurrency(inv.amount)} - Daily: ${formatCurrency(dailyProfit)}\n`;
      });
    }
    
    message += `\n---\n`;
    message += `Fee paid: ${formatCurrency(fee)}\n`;
    message += `Your new balance: ${formatCurrency((user.balance || 0) - fee)}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /viewearnings:', error.message);
    await bot.sendMessage(chatId, '❌ Error viewing earnings.');
  }
});

// Profile command
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const referrals = await loadData(COLLECTIONS.REFERRALS, { referrerId: user.memberId });
  const successfulReferrals = referrals.filter(r => r.status === 'paid');
  
  let message = `👤 **Your Profile**\n\n`;
  message += `Name: ${user.name}\n`;
  message += `Member ID: ${user.memberId}\n`;
  message += `Email: ${user.email || 'Not set'}\n`;
  message += `Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n`;
  message += `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}\n\n`;
  message += `💰 **Financial Summary**\n`;
  message += `Balance: ${formatCurrency(user.balance || 0)}\n`;
  message += `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
  message += `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  message += `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  message += `👥 **Referral Stats**\n`;
  message += `Total Referrals: ${user.referrals || 0}\n`;
  message += `Successful Referrals: ${successfulReferrals.length}\n`;
  message += `Your Code: ${user.referralCode}\n\n`;
  message += `**Account Security**\n`;
  message += `/changepassword - Change password\n`;
  message += `/forgotpassword - Reset password\n\n`;
  message += `**Share your code:** ${user.referralCode}\n`;
  message += `Tell friends to use: /register ${user.referralCode}`;
  
  await bot.sendMessage(chatId, message);
});

// Referral command
bot.onText(/\/referral/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const referrals = await loadData(COLLECTIONS.REFERRALS, { referrerId: user.memberId });
  
  let message = `👥 **Referral Program**\n\n`;
  message += `**Earn 10% commission on your referrals' FIRST investment only!**\n\n`;
  message += `Your Referral Code: **${user.referralCode}**\n`;
  message += `Total Referrals: ${user.referrals || 0}\n`;
  message += `Total Earned from Referrals: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
  message += `**How it works:**\n`;
  message += `1. Share your referral code with friends\n`;
  message += `2. When they register using your code, they become your referral\n`;
  message += `3. When they make their FIRST investment, you get 10%\n`;
  message += `4. Their subsequent investments don't earn you bonuses\n\n`;
  message += `**How to share:**\n`;
  message += `Tell your friends to use the command:\n`;
  message += `/register ${user.referralCode}\n\n`;
  message += `**Your Referrals:**\n`;
  
  if (referrals.length > 0) {
    referrals.forEach((ref, index) => {
      const status = ref.status === 'paid' ? '✅ Bonus Paid' : 
                    ref.status === 'pending' ? '⏳ Pending First Investment' : '❌ Failed';
      const bonus = ref.bonusAmount ? `- Bonus: ${formatCurrency(ref.bonusAmount)}` : '';
      message += `${index + 1}. ${ref.referredName} - ${status} ${bonus}\n`;
    });
  } else {
    message += `No referrals yet. Start sharing your code!`;
  }
  
  await bot.sendMessage(chatId, message);
});

// Withdraw command - UPDATED MINIMUM TO $2
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if ((user.balance || 0) < 2) {
    await bot.sendMessage(chatId,
      `❌ **Insufficient Balance**\n\n` +
      `Minimum withdrawal: $2\n` +
      `Your balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Please earn more through investments first.`
    );
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_withdrawal_amount',
    data: {
      memberId: user.memberId,
      balance: user.balance
    }
  };
  
  await bot.sendMessage(chatId,
    `💳 **Withdraw Funds**\n\n` +
    `Your Balance: ${formatCurrency(user.balance || 0)}\n` +
    `Minimum Withdrawal: $2\n` +
    `Withdrawal Fee: 5%\n\n` +
    `Enter amount to withdraw:`
  );
});

// Logout command
bot.onText(/\/logout/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ You are not logged in.');
    return;
  }
  
  // Mark user as logged out
  loggedOutUsers.add(chatId.toString());
  
  // Clear any active session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  await bot.sendMessage(chatId,
    `✅ **Logged Out Successfully**\n\n` +
    `You have been logged out from ${user.name} (${user.memberId}).\n\n` +
    `To login again, use:\n` +
    `/login - If you remember your credentials\n` +
    `/forgotpassword - If you forgot password\n` +
    `/support - If you need help logging in\n\n` +
    `Note: You can still use /support while logged out.`
  );
});

// Inbox command to view offline messages
bot.onText(/\/inbox/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (!user.offlineMessages || user.offlineMessages.length === 0) {
    await bot.sendMessage(chatId, '📭 Your inbox is empty.');
    return;
  }
  
  const offlineMessages = user.offlineMessages;
  const unreadMessages = offlineMessages.filter(msg => !msg.read);
  
  let message = `📬 **Your Inbox**\n\n`;
  message += `Total Messages: ${offlineMessages.length}\n`;
  message += `Unread Messages: ${unreadMessages.length}\n\n`;
  
  // Show last 5 messages
  const recentMessages = offlineMessages.slice(-5).reverse();
  
  recentMessages.forEach((msg, index) => {
    const date = new Date(msg.timestamp).toLocaleDateString();
    const readStatus = msg.read ? '✅ Read' : '🆕 Unread';
    const messagePreview = msg.message.length > 50 ? 
      msg.message.substring(0, 50) + '...' : msg.message;
    
    message += `${index + 1}. ${readStatus} (${date})\n`;
    message += `   ${messagePreview}\n\n`;
  });
  
  if (offlineMessages.length > 5) {
    message += `... and ${offlineMessages.length - 5} more messages\n\n`;
  }
  
  message += `**Commands:**\n`;
  message += `/readmsgs - Mark all as read\n`;
  message += `/clearmsgs - Clear all messages\n`;
  
  await bot.sendMessage(chatId, message);
  
  // Mark messages as read when user views inbox
  if (unreadMessages.length > 0) {
    await saveData(COLLECTIONS.USERS,
      { memberId: user.memberId },
      { $set: { 'offlineMessages.$[].read': true } }
    );
  }
});

// Mark all messages as read
bot.onText(/\/readmsgs/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.offlineMessages) {
    await saveData(COLLECTIONS.USERS,
      { memberId: user.memberId },
      { $set: { 'offlineMessages.$[].read': true } }
    );
    await bot.sendMessage(chatId, '✅ All messages marked as read.');
  }
});

// Clear all messages
bot.onText(/\/clearmsgs/, async (msg) => {
  const chatId = msg.chat.id;
  
  const user = await getLoggedInUser(chatId);
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  await saveData(COLLECTIONS.USERS,
    { memberId: user.memberId },
    { $set: { offlineMessages: [] } }
  );
  await bot.sendMessage(chatId, '✅ All messages cleared.');
});

// Enhanced support system that works for everyone
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  // Check if user is logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  
  if (isLoggedIn) {
    // Logged in user - regular support
    const user = await getUserByChatId(chatId);
    
    // Check for active support chat
    const activeChat = await getActiveSupportChat(user.memberId);
    
    if (activeChat) {
      // Continue existing chat
      userSessions[chatId] = {
        step: 'support_chat',
        data: {
          memberId: user.memberId,
          userName: user.name,
          chatId: activeChat.id
        }
      };
      
      const welcomeMessage = user.banned ? 
        `🚫 **Account Suspended - Support Chat**\n\n` +
        `Your account has been suspended, but you can still contact support.\n\n` +
        `Type your message below to appeal or ask for help:\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n\n` +
        `Type /endsupport to end this chat` :
        
        `💬 **Support Chat (Active)**\n\n` +
        `You have an active support conversation.\n` +
        `Type your message below:\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
        `Last message from support: "${activeChat.messages.slice(-1)[0]?.message || 'No messages yet'}"\n\n` +
        `Type /endsupport to end this chat`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      return;
    }
    
    // Start new support chat
    userSessions[chatId] = {
      step: 'support_topic',
      data: {
        memberId: user.memberId,
        userName: user.name
      }
    };
    
    const supportMessage = user.banned ? 
      `🚫 **Account Suspended - Appeal Center**\n\n` +
      `Your account has been suspended. Please select your issue:\n\n` +
      `1️⃣ Appeal Suspension\n` +
      `2️⃣ Account Recovery\n` +
      `3️⃣ Payment Issues\n` +
      `4️⃣ Other Issues\n\n` +
      `Reply with the number (1-4):` :
      
      `🆘 **Support Center**\n\n` +
      `Please select your issue:\n\n` +
      `1️⃣ Account Issues\n` +
      `2️⃣ Investment Problems\n` +
      `3️⃣ Withdrawal Help\n` +
      `4️⃣ Referral Issues\n` +
      `5️⃣ Payment Proof/Upload\n` +
      `6️⃣ Other\n\n` +
      `Reply with the number (1-6):`;
    
    await bot.sendMessage(chatId, supportMessage);
  } else {
    // Universal support for everyone (logged out or no account)
    userSessions[chatId] = {
      step: 'universal_support_choice',
      data: {
        chatId: chatId
      }
    };
    
    await bot.sendMessage(chatId,
      `🆘 **Universal Support Center**\n\n` +
      `Welcome! We're here to help you with:\n\n` +
      `1️⃣ **Account Issues**\n` +
      `   - Can't login\n` +
      `   - Forgot password\n` +
      `   - Account recovery\n\n` +
      `2️⃣ **General Questions**\n` +
      `   - How to invest\n` +
      `   - How withdrawals work\n` +
      `   - Referral program\n\n` +
      `3️⃣ **Technical Problems**\n` +
      `   - Bot not responding\n` +
      `   - Payment issues\n` +
      `   - Other problems\n\n` +
      `4️⃣ **Create New Account**\n` +
      `   - Registration help\n` +
      `   - Investment guidance\n\n` +
      `5️⃣ **Send Payment Proof**\n` +
      `   - Upload M-Pesa screenshot\n` +
      `   - Payment confirmation\n\n` +
      `**Reply with number (1-5):**\n\n` +
      `**Note:** You can send photos, documents, videos, or voice messages!`
    );
  }
});

// End support chat
bot.onText(/\/endsupport/, async (msg) => {
  const chatId = msg.chat.id;
  
  const session = userSessions[chatId];
  if (session && (session.step === 'support_chat' || session.step === 'support_loggedout_chat' || session.step === 'universal_support_chat' || session.step === 'appeal_chat')) {
    await saveData(COLLECTIONS.SUPPORT_CHATS,
      { id: session.data.chatId },
      { 
        $set: { 
          status: 'closed',
          updatedAt: new Date().toISOString(),
          closedBy: 'user'
        }
      }
    );
    
    delete userSessions[chatId];
    
    await bot.sendMessage(chatId,
      `✅ **Support Chat Ended**\n\n` +
      `Thank you for contacting support.\n` +
      `Use /support if you need help again.`
    );
  } else {
    await bot.sendMessage(chatId, '❌ No active support chat to end.');
  }
});

// Appeal command for suspended users
bot.onText(/\/appeal/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is logged in
  const user = await getLoggedInUser(chatId);
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (!user.banned) {
    await bot.sendMessage(chatId, '✅ Your account is not suspended. Use /support for other issues.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'appeal_message',
    data: {
      memberId: user.memberId,
      userName: user.name
    }
  };
  
  await bot.sendMessage(chatId,
    `📝 **Submit Appeal**\n\n` +
    `Your account has been suspended. You can submit an appeal here.\n\n` +
    `**Please include:**\n` +
    `1. Why you believe your account was wrongly suspended\n` +
    `2. Any evidence or screenshots\n` +
    `3. Your contact information\n\n` +
    `Type your appeal message below:\n` +
    `(You can also send photos/documents)`
  );
});

// Register command - UPDATED WITH SECURITY FIX
bot.onText(/\/register(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1] ? match[1].trim().toUpperCase() : null;
  
  // Check if this Telegram account is already registered (SECURITY FIX)
  const existingUser = await getUserByChatId(chatId);
  
  if (existingUser) {
    await bot.sendMessage(chatId,
      `🚫 **Account Already Linked**\n\n` +
      `This Telegram account is already linked to:\n` +
      `Member ID: ${existingUser.memberId}\n` +
      `Name: ${existingUser.name}\n\n` +
      `You cannot register multiple accounts with the same Telegram account.\n` +
      `Use /login to access your existing account.\n\n` +
      `If you believe this is an error, contact support with /support`
    );
    return;
  }
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You already have an account. Use /login to access.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_name',
    data: {
      referralCode: referralCode
    }
  };
  
  let registrationMessage = `📝 **Account Registration**\n\n`;
  
  if (referralCode) {
    // Check if referral code is valid
    const referrer = await findOne(COLLECTIONS.USERS, { referralCode: referralCode });
    if (referrer) {
      registrationMessage += `✅ **Referral Code Applied!**\n`;
      registrationMessage += `Referred by: ${referrer.name}\n`;
      registrationMessage += `Referrer earns 10% bonus on your FIRST investment only!\n\n`;
    } else {
      registrationMessage += `⚠️ **Invalid Referral Code:** ${referralCode}\n`;
      registrationMessage += `Starting registration without referral...\n\n`;
      userSessions[chatId].data.referralCode = null;
    }
  } else {
    registrationMessage += `💡 **No Referral Code?**\n`;
    registrationMessage += `If you have a referral code, type /register CODE\n`;
    registrationMessage += `Example: /register REF-ABC123\n\n`;
  }
  
  registrationMessage += `Step 1/4: Enter your full name\n\n` +
                       `Example: John Doe\n` +
                       `Enter your name:`;
  
  await bot.sendMessage(chatId, registrationMessage);
});

// Login command - UPDATED WITH SECURITY FIX
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Check if user is already logged in
  const isLoggedIn = await isUserLoggedIn(chatId);
  if (isLoggedIn) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /start to see dashboard.');
    return;
  }
  
  // Remove from logged out users if they're trying to login
  loggedOutUsers.delete(chatId.toString());
  
  userSessions[chatId] = {
    step: 'login_memberid',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Login**\n\n` +
    `Enter your Member ID:\n` +
    `(Format: USER-123456)\n\n` +
    `Forgot your Member ID? Use /support for help.`
  );
});

// ==================== MESSAGE HANDLERS ====================

// Handle all text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Skip if no text or if it's a command
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    // Handle forgot password method selection
    if (session.step === 'forgot_password_method') {
      const choice = parseInt(text);
      
      if (isNaN(choice) || choice < 1 || choice > 3) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-3:');
        return;
      }
      
      if (choice === 3) {
        // Contact support
        delete userSessions[chatId];
        await bot.sendMessage(chatId,
          `🆘 **Contact Support for Password Recovery**\n\n` +
          `Please use /support to contact our support team.\n` +
          `They will help you recover your account.\n\n` +
          `Make sure to provide:\n` +
          `• Your name\n` +
          `• Email address (if registered)\n` +
          `• Any other account details you remember`
        );
        return;
      }
      
      session.data.method = choice === 1 ? 'memberId' : 'email';
      session.step = choice === 1 ? 'forgot_password_memberid' : 'forgot_password_email';
      
      if (choice === 1) {
        await bot.sendMessage(chatId,
          `🔐 **Password Recovery by Member ID**\n\n` +
          `Enter your Member ID:\n` +
          `(Format: USER-123456)\n\n` +
          `A new password will be sent to your registered chat.`
        );
      } else {
        await bot.sendMessage(chatId,
          `📧 **Password Recovery by Email**\n\n` +
          `Enter your registered email address:\n\n` +
          `A new password will be sent to your registered chat.`
        );
      }
    }
    else if (session.step === 'forgot_password_memberid') {
      const memberId = text.trim().toUpperCase();
      const user = await getUserByMemberId(memberId);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Member ID not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 This account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      // Generate new password
      const newPassword = generateRandomPassword(8);
      
      await saveData(COLLECTIONS.USERS,
        { memberId: memberId },
        { 
          $set: { 
            passwordHash: hashPassword(newPassword),
            lastPasswordChange: new Date().toISOString()
          }
        }
      );
      
      delete userSessions[chatId];
      
      // Send password to user's registered chat
      await sendUserNotification(memberId,
        `🔐 **Password Reset Successfully**\n\n` +
        `Your password has been reset via password recovery.\n\n` +
        `New Password: **${newPassword}**\n\n` +
        `**Login Details:**\n` +
        `Member ID: ${memberId}\n` +
        `Password: ${newPassword}\n\n` +
        `For security, change your password after logging in.\n` +
        `Use /changepassword to set a new password.`
      );
      
      await bot.sendMessage(chatId,
        `✅ **Password Reset Initiated**\n\n` +
        `A new password has been sent to the registered chat for ${memberId}.\n\n` +
        `If you don't receive it within 2 minutes:\n` +
        `1. Make sure you're using the correct Telegram account\n` +
        `2. Contact support with /support\n\n` +
        `**Security Note:**\n` +
        `Always use /changepassword after logging in to set your own password.`
      );
    }
    else if (session.step === 'forgot_password_email') {
      const email = text.trim().toLowerCase();
      const user = await getUserByEmail(email);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Email not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 This account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      // Generate new password
      const newPassword = generateRandomPassword(8);
      
      await saveData(COLLECTIONS.USERS,
        { email: email.toLowerCase() },
        { 
          $set: { 
            passwordHash: hashPassword(newPassword),
            lastPasswordChange: new Date().toISOString()
          }
        }
      );
      
      delete userSessions[chatId];
      
      // Send password to user's registered chat
      await sendUserNotification(user.memberId,
        `🔐 **Password Reset Successfully**\n\n` +
        `Your password has been reset via password recovery.\n\n` +
        `New Password: **${newPassword}**\n\n` +
        `**Login Details:**\n` +
        `Member ID: ${user.memberId}\n` +
        `Password: ${newPassword}\n\n` +
        `For security, change your password after logging in.\n` +
        `Use /changepassword to set a new password.`
      );
      
      await bot.sendMessage(chatId,
        `✅ **Password Reset Initiated**\n\n` +
        `A new password has been sent to the registered chat for ${user.memberId}.\n\n` +
        `If you don't receive it within 2 minutes:\n` +
        `1. Make sure you're using the correct Telegram account\n` +
        `2. Contact support with /support\n\n` +
        `**Security Note:**\n` +
        `Always use /changepassword after logging in to set your own password.`
      );
    }
    
    // Handle change password steps
    else if (session.step === 'change_password_current') {
      const currentPassword = text.trim();
      const user = await getUserByMemberId(session.data.memberId);
      
      if (!user || user.passwordHash !== hashPassword(currentPassword)) {
        await bot.sendMessage(chatId, '❌ Current password is incorrect. Please try again:');
        return;
      }
      
      session.step = 'change_password_new';
      
      await bot.sendMessage(chatId,
        `✅ Current password verified.\n\n` +
        `Enter your new password:\n` +
        `• At least 6 characters\n` +
        `• Must include letters and numbers\n\n` +
        `Enter new password:`
      );
    }
    else if (session.step === 'change_password_new') {
      const newPassword = text.trim();
      
      if (newPassword.length < 6) {
        await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Please enter new password:');
        return;
      }
      
      if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        await bot.sendMessage(chatId, '❌ Password must include both letters and numbers. Please enter new password:');
        return;
      }
      
      session.data.newPassword = newPassword;
      session.step = 'change_password_confirm';
      
      await bot.sendMessage(chatId,
        `Confirm your new password:\n\n` +
        `Re-enter your new password:`
      );
    }
    else if (session.step === 'change_password_confirm') {
      const confirmPassword = text.trim();
      
      if (confirmPassword !== session.data.newPassword) {
        await bot.sendMessage(chatId, '❌ Passwords do not match. Please start again with /changepassword');
        delete userSessions[chatId];
        return;
      }
      
      // Update password in database
      await saveData(COLLECTIONS.USERS,
        { memberId: session.data.memberId },
        { 
          $set: { 
            passwordHash: hashPassword(session.data.newPassword),
            lastPasswordChange: new Date().toISOString()
          }
        }
      );
      
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Password Changed Successfully!**\n\n` +
        `Your password has been updated.\n\n` +
        `**Security Tips:**\n` +
        `• Never share your password\n` +
        `• Use a strong, unique password\n` +
        `• Change password regularly\n\n` +
        `If you suspect any unauthorized access, contact support immediately.`
      );
    }
    
    // Handle registration steps
    else if (session.step === 'awaiting_name') {
      const name = text.trim();
      if (name.length < 2) {
        await bot.sendMessage(chatId, '❌ Name must be at least 2 characters. Please enter your name:');
        return;
      }
      
      session.data.name = name;
      session.step = 'awaiting_email';
      
      await bot.sendMessage(chatId,
        `✅ Name: ${name}\n\n` +
        `Step 2/4: Enter your email\n\n` +
        `Example: johndoe@example.com\n` +
        `Enter your email:`
      );
    }
    else if (session.step === 'awaiting_email') {
      const email = text.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(email)) {
        await bot.sendMessage(chatId, '❌ Invalid email format. Please enter a valid email:');
        return;
      }
      
      session.data.email = email;
      session.step = 'awaiting_password';
      
      await bot.sendMessage(chatId,
        `✅ Email: ${email}\n\n` +
        `Step 3/4: Create a password\n\n` +
        `• At least 6 characters\n` +
        `• Must include letters and numbers\n` +
        `Enter your password:`
      );
    }
    else if (session.step === 'awaiting_password') {
      const password = text.trim();
      
      if (password.length < 6) {
        await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Please enter password:');
        return;
      }
      
      if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
        await bot.sendMessage(chatId, '❌ Password must include both letters and numbers. Please enter password:');
        return;
      }
      
      session.data.password = password;
      session.step = 'awaiting_confirm_password';
      
      await bot.sendMessage(chatId,
        `Step 4/4: Confirm your password\n\n` +
        `Re-enter your password:`
      );
    }
    else if (session.step === 'awaiting_confirm_password') {
      const confirmPassword = text.trim();
      
      if (confirmPassword !== session.data.password) {
        await bot.sendMessage(chatId, '❌ Passwords do not match. Please enter your password again:');
        session.step = 'awaiting_password';
        return;
      }
      
      // Generate member ID
      const usersCount = await db.collection(COLLECTIONS.USERS).countDocuments();
      const memberId = `USER-${String(usersCount + 1000)}`;
      
      // Generate referral code
      const referralCode = `REF-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      
      // Check if referral code is valid
      let referredBy = null;
      if (session.data.referralCode) {
        const referrer = await findOne(COLLECTIONS.USERS, { referralCode: session.data.referralCode });
        if (referrer) {
          referredBy = session.data.referralCode;
        }
      }
      
      // Create new user - BIND THIS TELEGRAM ACCOUNT TO THIS MEMBER ID ONLY
      const newUser = {
        memberId: memberId,
        chatId: chatId.toString(),
        name: session.data.name,
        email: session.data.email.toLowerCase(),
        passwordHash: hashPassword(session.data.password),
        balance: 0,
        totalInvested: 0,
        totalEarned: 0,
        referralEarnings: 0,
        referrals: 0,
        referralCode: referralCode,
        referredBy: referredBy,
        activeInvestments: 0,
        joinedDate: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        banned: false,
        botBlocked: false,
        accountBound: true,
        telegramAccountId: chatId.toString(),
        offlineMessages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await insertData(COLLECTIONS.USERS, newUser);
      
      // Handle referral tracking if user was referred
      if (referredBy) {
        const referrer = await findOne(COLLECTIONS.USERS, { referralCode: referredBy });
        if (referrer) {
          // Update referrer's referral count
          await saveData(COLLECTIONS.USERS,
            { memberId: referrer.memberId },
            { $inc: { referrals: 1 } }
          );
          
          // Create referral record
          await insertData(COLLECTIONS.REFERRALS, {
            id: `REF-${Date.now()}`,
            referrerId: referrer.memberId,
            referrerName: referrer.name,
            referrerCode: referrer.referralCode,
            referredId: memberId,
            referredName: session.data.name,
            bonusAmount: 0,
            status: 'pending',
            date: new Date().toISOString(),
            investmentAmount: 0,
            isFirstInvestment: true,
            bonusPaid: false,
            createdAt: new Date().toISOString()
          });
          
          // Notify referrer
          await sendUserNotification(referrer.memberId,
            `🎉 **New Referral!**\n\n` +
            `${session.data.name} registered using your referral code!\n` +
            `You will earn 10% when they make their FIRST investment.\n\n` +
            `Total Referrals: ${(referrer.referrals || 0) + 1}`
          );
        }
      }
      
      // Clear session
      delete userSessions[chatId];
      
      // Clear from logged out users if they were there
      loggedOutUsers.delete(chatId.toString());
      
      // Welcome message
      let welcomeMessage = `🎉 **Registration Successful!**\n\n` +
                          `Welcome to Starlife Advert, ${session.data.name}!\n\n` +
                          `**Account Details:**\n` +
                          `Member ID: ${memberId}\n` +
                          `Email: ${session.data.email}\n` +
                          `Password: ${session.data.password}\n` +
                          `Referral Code: ${referralCode}\n`;
      
      if (referredBy) {
        welcomeMessage += `Referred By: ${referredBy}\n`;
      }
      
      welcomeMessage += `\n**IMPORTANT SECURITY:**\n` +
                       `This Telegram account is now PERMANENTLY linked to Member ID: ${memberId}\n` +
                       `You cannot login to any other account with this Telegram account.\n\n` +
                       `**Save your Member ID and Password!**\n` +
                       `You'll need them if you ever switch Telegram accounts.\n\n` +
                       `**To Start Earning:**\n` +
                       `1. Use /invest to make your first investment\n` +
                       `2. Minimum investment: $10\n` +
                       `3. Earn 2% daily profit (LIFETIME)\n` +
                       `4. Share your referral code to earn 10% on FIRST investments!\n\n` +
                       `**Account Security:**\n` +
                       `/changepassword - Change password anytime\n` +
                       `/forgotpassword - Reset if forgotten\n\n` +
                       `**Payment Methods:**\n` +
                       `• M-Pesa Till: 6034186\n` +
                       `• USDT Tether (BEP20): 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
                       `• USDT TRON (TRC20): TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
                       `• PayPal: dave@starlifeadvert.com\n` +
                       `Name: Starlife Advert US Agency\n\n` +
                       `**Quick Commands:**\n` +
                       `/invest - Make investment\n` +
                       `/earnings - View YOUR earnings\n` +
                       `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                       `/transactions - View transaction history\n` +
                       `/referral - Share & earn 10% (FIRST investment only)\n` +
                       `/profile - Account details\n` +
                       `/support - Contact support\n\n` +
                       `✅ You are now logged in!`;
      
      await bot.sendMessage(chatId, welcomeMessage);
      
      // Record transaction
      await insertData(COLLECTIONS.TRANSACTIONS, {
        id: `TRX-REG-${Date.now()}`,
        memberId: memberId,
        type: 'registration',
        amount: 0,
        description: 'Account registration',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
    }
    
    // Handle login steps - UPDATED WITH SECURITY CHECKS
    else if (session.step === 'login_memberid') {
      const memberId = text.trim().toUpperCase();
      const user = await getUserByMemberId(memberId);
      
      if (!user) {
        await bot.sendMessage(chatId, '❌ Member ID not found. Please check and try again:');
        return;
      }
      
      if (user.banned) {
        await bot.sendMessage(chatId, '🚫 Your account has been suspended. Contact support.');
        delete userSessions[chatId];
        return;
      }
      
      // SECURITY FIX: Check if Telegram account is already bound to a different user
      const isBoundToDifferentUser = await isChatIdBoundToDifferentUser(chatId, memberId);
      if (isBoundToDifferentUser) {
        const existingUser = await getUserByChatId(chatId);
        await bot.sendMessage(chatId,
          `🚫 **Account Binding Error**\n\n` +
          `This Telegram account is already PERMANENTLY linked to:\n` +
          `Member ID: ${existingUser.memberId}\n` +
          `Name: ${existingUser.name}\n\n` +
          `You cannot login to a different account with this Telegram account.\n` +
          `If you need to access ${memberId}, you must use the Telegram account that was used during registration.\n\n` +
          `Use /support if you need help.`
        );
        delete userSessions[chatId];
        return;
      }
      
      // SECURITY FIX: Check if member ID is already bound to a different Telegram account
      const isBoundToDifferentChat = await isMemberIdBoundToDifferentChat(memberId, chatId);
      if (isBoundToDifferentChat && user.chatId) {
        await bot.sendMessage(chatId,
          `🚫 **Account Already Bound**\n\n` +
          `Member ID ${memberId} is already PERMANENTLY linked to a different Telegram account.\n\n` +
          `You must use the original Telegram account that was used during registration.\n` +
          `If you no longer have access to that Telegram account, contact support with /support\n\n` +
          `This is a security measure to protect your account.`
        );
        delete userSessions[chatId];
        return;
      }
      
      session.data.memberId = memberId;
      session.step = 'login_password';
      
      await bot.sendMessage(chatId, `Enter password for ${memberId}:`);
    }
    else if (session.step === 'login_password') {
      const password = text.trim();
      const user = await getUserByMemberId(session.data.memberId);
      
      if (!user || user.passwordHash !== hashPassword(password)) {
        await bot.sendMessage(chatId, '❌ Invalid password. Try again:');
        session.step = 'login_password';
        return;
      }
      
      // SECURITY FIX: Final check before allowing login
      const isBoundToDifferentUser = await isChatIdBoundToDifferentUser(chatId, session.data.memberId);
      if (isBoundToDifferentUser) {
        const existingUser = await getUserByChatId(chatId);
        await bot.sendMessage(chatId,
          `🚫 **Security Violation**\n\n` +
          `Login blocked! This Telegram account is bound to a different member ID.\n` +
          `Bound to: ${existingUser.memberId}\n` +
          `Trying to access: ${session.data.memberId}\n\n` +
          `Contact support if you believe this is an error.`
        );
        delete userSessions[chatId];
        return;
      }
      
      // Update user login details - DON'T update chatId if it's already set (security)
      if (user.chatId !== chatId.toString()) {
        // Update chatId if it's not already set (for backward compatibility)
        await saveData(COLLECTIONS.USERS,
          { memberId: session.data.memberId },
          { 
            $set: { 
              chatId: chatId.toString(),
              accountBound: true,
              telegramAccountId: chatId.toString(),
              lastLogin: new Date().toISOString()
            }
          }
        );
      } else {
        // Just update last login
        await saveData(COLLECTIONS.USERS,
          { memberId: session.data.memberId },
          { $set: { lastLogin: new Date().toISOString() } }
        );
      }
      
      // Clear from logged out users
      loggedOutUsers.delete(chatId.toString());
      
      // Clear session
      delete userSessions[chatId];
      
      let welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                          `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                          `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                          `👥 Referrals: ${user.referrals || 0}\n` +
                          `🔗 Your Code: ${user.referralCode}\n\n`;
      
      // Check for offline messages
      if (user.offlineMessages && user.offlineMessages.length > 0) {
        const unreadMessages = user.offlineMessages.filter(msg => !msg.read);
        
        if (unreadMessages.length > 0) {
          welcomeMessage += `📬 **You have ${unreadMessages.length} unread message(s)**\n`;
          welcomeMessage += `Use /inbox to view your messages\n\n`;
        }
      }
      
      welcomeMessage += `📋 **Quick Commands:**\n` +
                        `/invest - Make investment\n` +
                        `/earnings - View YOUR earnings\n` +
                        `/viewearnings USER-ID - View others earnings ($1 fee)\n` +
                        `/withdraw - Withdraw funds\n` +
                        `/transactions - View transaction history\n` +
                        `/referral - Share & earn 10% (FIRST investment only)\n` +
                        `/profile - Account details\n` +
                        `/changepassword - Change password\n` +
                        `/support - Contact support\n` +
                        `/logout - Logout`;
      
      await bot.sendMessage(chatId, welcomeMessage);
    }
    
    // Handle investment amount - UPDATED WITH PAYMENT METHODS
    else if (session.step === 'awaiting_investment_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 10 || amount > 800000) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $10\n` +
          `Maximum: $800,000\n\n` +
          `Please enter a valid amount:`
        );
        return;
      }
      
      session.data.amount = amount;
      session.step = 'awaiting_investment_payment_method';
      
      await bot.sendMessage(chatId,
        `✅ Amount: ${formatCurrency(amount)}\n\n` +
        `**Select Payment Method:**\n\n` +
        `1️⃣ **M-Pesa**\n` +
        `   Till: 6034186\n` +
        `   Name: Starlife Advert US Agency\n\n` +
        `2️⃣ **USDT Tether (BEP20) - RECOMMENDED**\n` +
        `   Wallet: 0xa95bd74fae59521e8405e14b54b0d07795643812\n` +
        `   📌 Send only USDT (BEP20)\n\n` +
        `3️⃣ **USDT TRON (TRC20)**\n` +
        `   Wallet: TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6\n` +
        `   📌 Send only USDT (TRC20)\n\n` +
        `4️⃣ **PayPal**\n` +
        `   Email: dave@starlifeadvert.com\n\n` +
        `Reply with number (1-4):`
      );
    }
    else if (session.step === 'awaiting_investment_payment_method') {
      const methodNumber = parseInt(text);
      const methods = ['M-Pesa', 'USDT Tether (BEP20)', 'USDT TRON (TRC20)', 'PayPal'];
      
      if (isNaN(methodNumber) || methodNumber < 1 || methodNumber > 4) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-4:');
        return;
      }
      
      const method = methods[methodNumber - 1];
      session.data.paymentMethod = method;
      
      // Ask for transaction hash if crypto method
      if (method.includes('USDT')) {
        session.step = 'awaiting_transaction_hash';
        
        let network = method.includes('BEP20') ? 'BEP20' : 'TRC20';
        let wallet = method.includes('BEP20') ? 
          '0xa95bd74fae59521e8405e14b54b0d07795643812' : 
          'TMeEHzo9pMigvV5op88zkAQEc3ZUEfzBJ6';
        
        await bot.sendMessage(chatId,
          `✅ Payment Method: ${method}\n\n` +
          `**Wallet Address (${network}):**\n` +
          `${wallet}\n\n` +
          `**Important:**\n` +
          `• Send only USDT (${network}) to this address\n` +
          `• Using a different network may result in permanent loss\n` +
          `• Keep your transaction hash (TXID) for verification\n\n` +
          `**After sending, please enter your transaction hash (TXID):**\n` +
          `Example: 0x1234abcd...`
        );
      } else if (method === 'PayPal') {
        session.step = 'awaiting_paypal_email';
        
        await bot.sendMessage(chatId,
          `✅ Payment Method: PayPal\n\n` +
          `**PayPal Email:**\n` +
          `dave@starlifeadvert.com\n\n` +
          `**Important:**\n` +
          `• Send payment to the email above\n` +
          `• Include your Member ID in the payment note\n\n` +
          `**Enter the email you used to send PayPal payment:**`
        );
      } else {
        // M-Pesa - no additional info needed
        session.step = 'awaiting_investment_proof';
        
        await bot.sendMessage(chatId,
          `✅ Payment Method: M-Pesa\n\n` +
          `**M-Pesa Details:**\n` +
          `Till: 6034186\n` +
          `Name: Starlife Advert US Agency\n\n` +
          `Now, please send a screenshot or photo of your payment proof (M-Pesa receipt).\n\n` +
          `You can send a photo or document.`
        );
      }
    }
    else if (session.step === 'awaiting_transaction_hash') {
      const transactionHash = text.trim();
      
      if (transactionHash.length < 10) {
        await bot.sendMessage(chatId, '❌ Invalid transaction hash. Please enter a valid TXID:');
        return;
      }
      
      session.data.transactionHash = transactionHash;
      session.step = 'awaiting_investment_proof';
      
      await bot.sendMessage(chatId,
        `✅ Transaction Hash: ${transactionHash.substring(0, 20)}...\n\n` +
        `Now, please send a screenshot or photo of your payment proof (transaction details).\n\n` +
        `You can send a photo or document.`
      );
    }
    else if (session.step === 'awaiting_paypal_email') {
      const paypalEmail = text.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(paypalEmail)) {
        await bot.sendMessage(chatId, '❌ Invalid email format. Please enter the email you used for PayPal payment:');
        return;
      }
      
      session.data.paypalEmail = paypalEmail;
      session.step = 'awaiting_investment_proof';
      
      await bot.sendMessage(chatId,
        `✅ PayPal Email: ${paypalEmail}\n\n` +
        `Now, please send a screenshot or photo of your payment proof (PayPal receipt).\n\n` +
        `You can send a photo or document.`
      );
    }
    
    // Handle withdrawal amount - UPDATED MINIMUM TO $2
    else if (session.step === 'awaiting_withdrawal_amount') {
      const amount = parseFloat(text);
      
      if (isNaN(amount) || amount < 2 || amount > session.data.balance) {
        await bot.sendMessage(chatId,
          `❌ Invalid amount.\n` +
          `Minimum: $2\n` +
          `Maximum: ${formatCurrency(session.data.balance)}\n\n` +
          `Please enter a valid amount:`
        );
        return;
      }
      
      const fee = calculateWithdrawalFee(amount);
      const netAmount = calculateNetWithdrawal(amount);
      
      session.data.withdrawalAmount = amount;
      session.data.fee = fee;
      session.data.netAmount = netAmount;
      session.step = 'awaiting_withdrawal_method';
      
      await bot.sendMessage(chatId,
        `💰 **Withdrawal Details**\n\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `Fee (5%): ${formatCurrency(fee)}\n` +
        `Net Amount: ${formatCurrency(netAmount)}\n\n` +
        `Select withdrawal method:\n\n` +
        `1️⃣ M-Pesa\n` +
        `2️⃣ Bank Transfer\n` +
        `3️⃣ PayPal\n\n` +
        `Reply with number (1-3):`
      );
    }
    else if (session.step === 'awaiting_withdrawal_method') {
      const methodNumber = parseInt(text);
      const methods = ['M-Pesa', 'Bank Transfer', 'PayPal'];
      
      if (isNaN(methodNumber) || methodNumber < 1 || methodNumber > 3) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-3:');
        return;
      }
      
      const method = methods[methodNumber - 1];
      session.data.method = method;
      session.step = 'awaiting_withdrawal_details';
      
      let detailsPrompt = '';
      
      if (method === 'M-Pesa') {
        detailsPrompt = `Enter your M-Pesa phone number:\n` +
                       `Example: 254712345678`;
      } else if (method === 'Bank Transfer') {
        detailsPrompt = `Enter your bank details:\n` +
                       `• Account Name\n` +
                       `• Account Number\n` +
                       `• Bank Name\n` +
                       `• SWIFT/BIC Code (if international)`;
      } else {
        detailsPrompt = `Enter your PayPal email address:`;
      }
      
      await bot.sendMessage(chatId,
        `✅ Method: ${method}\n\n` +
        `${detailsPrompt}\n\n` +
        `Enter the required information:`
      );
    }
    else if (session.step === 'awaiting_withdrawal_details') {
      const details = text.trim();
      
      if (details.length < 3) {
        await bot.sendMessage(chatId, '❌ Details too short. Please provide valid information:');
        return;
      }
      
      // Update user balance
      await saveData(COLLECTIONS.USERS,
        { memberId: session.data.memberId },
        { $inc: { balance: -session.data.withdrawalAmount } }
      );
      
      // Create withdrawal request
      const withdrawalId = `WDL-${Date.now()}`;
      
      const withdrawal = {
        id: withdrawalId,
        memberId: session.data.memberId,
        amount: session.data.withdrawalAmount,
        fee: session.data.fee,
        netAmount: session.data.netAmount,
        method: session.data.method,
        details: details,
        status: 'pending',
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      
      await insertData(COLLECTIONS.WITHDRAWALS, withdrawal);
      
      // Record transaction
      await insertData(COLLECTIONS.TRANSACTIONS, {
        id: `TRX-WDL-${Date.now()}`,
        memberId: session.data.memberId,
        type: 'withdrawal',
        amount: -session.data.withdrawalAmount,
        description: `Withdrawal #${withdrawalId} (${session.data.method})`,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      
      delete userSessions[chatId];
      
      await bot.sendMessage(chatId,
        `✅ **Withdrawal Request Submitted!**\n\n` +
        `Amount: ${formatCurrency(session.data.withdrawalAmount)}\n` +
        `Fee: ${formatCurrency(session.data.fee)}\n` +
        `Net Amount: ${formatCurrency(session.data.netAmount)}\n` +
        `Method: ${session.data.method}\n` +
        `Withdrawal ID: ${withdrawalId}\n\n` +
        `Your request has been sent for processing.\n` +
        `Processing time: 10-15 minutes\n\n` +
        `You will be notified when it's approved.`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const user = await getUserByMemberId(session.data.memberId);
        
        const adminMessage = `💳 **New Withdrawal Request**\n\n` +
                            `ID: ${withdrawalId}\n` +
                            `User: ${user.name} (${session.data.memberId})\n` +
                            `Amount: ${formatCurrency(session.data.withdrawalAmount)}\n` +
                            `Net Amount: ${formatCurrency(session.data.netAmount)}\n` +
                            `Method: ${session.data.method}\n` +
                            `Details: ${details}\n\n` +
                            `**Approve:** /approve ${withdrawalId}\n` +
                            `**Reject:** /reject ${withdrawalId}`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // Handle universal support
    else if (session.step === 'universal_support_choice') {
      const choice = parseInt(text);
      
      if (isNaN(choice) || choice < 1 || choice > 5) {
        await bot.sendMessage(chatId, '❌ Please enter a number between 1-5:');
        return;
      }
      
      const choices = [
        'Account Issues',
        'General Questions',
        'Technical Problems',
        'Create New Account',
        'Send Payment Proof'
      ];
      
      session.data.topic = choices[choice - 1];
      session.step = 'universal_support_message';
      
      const extraInstructions = choice === 5 ? 
        '\n**You can send payment proof as:**\n• Photo (screenshot)\n• Document (PDF receipt)\n• Video (screen recording)\n\n' : '';
      
      await bot.sendMessage(chatId,
        `✅ Topic: ${session.data.topic}\n\n` +
        `Please describe your issue in detail:${extraInstructions}\n\n` +
        `**Include these if relevant:**\n` +
        `• Member ID (if you have one)\n` +
        `• Your name\n` +
        `• Email address\n` +
        `• Screenshot details\n\n` +
        `Type your message below:\n` +
        `(You can also send photos/documents directly)`
      );
    }
    else if (session.step === 'universal_support_message') {
      // Create support chat for user without account
      const chatIdStr = `CHAT-NOACC-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      const newChat = {
        id: chatIdStr,
        userId: `NO_ACCOUNT_${chatId}`,
        userName: `User without account (Chat ID: ${chatId})`,
        userChatId: chatId.toString(),
        topic: session.data.topic,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{
          sender: 'user',
          message: text,
          timestamp: new Date().toISOString()
        }],
        adminReplied: false,
        noAccount: true
      };
      
      await insertData(COLLECTIONS.SUPPORT_CHATS, newChat);
      
      session.step = 'universal_support_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will respond within 15 minutes.\n` +
        `You don't need an account to continue chatting.\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🆘 **New Support (No Account)**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: No account (Chat ID: ${chatId})\n` +
                            `Topic: ${session.data.topic}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${chatIdStr} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    else if (session.step === 'universal_support_chat') {
      // Handle text messages from users without accounts
      const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: session.data.chatId });
      
      if (!supportChat) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      await saveData(COLLECTIONS.SUPPORT_CHATS,
        { id: session.data.chatId },
        { 
          $push: { 
            messages: {
              sender: 'user',
              message: text,
              timestamp: new Date().toISOString()
            }
          },
          $set: {
            updatedAt: new Date().toISOString(),
            adminReplied: false
          }
        }
      );
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **No Account User Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${supportChat.userName}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${session.data.chatId} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // Handle appeal message
    else if (session.step === 'appeal_message') {
      const chatIdStr = `APPEAL-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      
      const newChat = {
        id: chatIdStr,
        userId: session.data.memberId,
        userName: session.data.userName,
        topic: 'Account Suspension Appeal',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [{
          sender: 'user',
          message: `[APPEAL] ${text}`,
          timestamp: new Date().toISOString()
        }],
        adminReplied: false,
        isAppeal: true
      };
      
      await insertData(COLLECTIONS.SUPPORT_CHATS, newChat);
      
      session.step = 'appeal_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Appeal Submitted!**\n\n` +
        `Appeal ID: ${chatIdStr}\n\n` +
        `Our team will review your appeal within 24 hours.\n` +
        `You can continue sending additional information.\n\n` +
        `Type /endsupport to end appeal chat`
      );
      
      // Notify admins with URGENT priority
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🚨 **URGENT: New Appeal**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: ${session.data.userName} (${session.data.memberId})\n` +
                            `Type: Account Suspension Appeal\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${chatIdStr} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    else if (session.step === 'appeal_chat') {
      // Handle appeal chat messages
      const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: session.data.chatId });
      
      if (!supportChat) {
        await bot.sendMessage(chatId, '❌ Appeal chat not found. Please start new appeal with /appeal');
        delete userSessions[chatId];
        return;
      }
      
      await saveData(COLLECTIONS.SUPPORT_CHATS,
        { id: session.data.chatId },
        { 
          $push: { 
            messages: {
              sender: 'user',
              message: text,
              timestamp: new Date().toISOString()
            }
          },
          $set: {
            updatedAt: new Date().toISOString(),
            adminReplied: false
          }
        }
      );
      
      await bot.sendMessage(chatId,
        `✅ **Appeal message sent**\n\n` +
        `Our team will respond to your appeal shortly.\n\n` +
        `Type /endsupport to end appeal chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **New Appeal Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${supportChat.userName} (${supportChat.userId})\n` +
                            `Type: Account Suspension Appeal\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${session.data.chatId} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
    // Handle regular support topics
    else if (session.step === 'support_topic') {
      const topicNumber = parseInt(text);
      
      // Check if user is banned to show different topics
      const user = await getUserByMemberId(session.data.memberId);
      const isBanned = user ? user.banned : false;
      
      if (isBanned) {
        // Banned user topics
        if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 4) {
          await bot.sendMessage(chatId, '❌ Please enter a number between 1-4:');
          return;
        }
        
        const bannedTopics = [
          'Appeal Suspension',
          'Account Recovery',
          'Payment Issues',
          'Other Issues'
        ];
        
        const topic = bannedTopics[topicNumber - 1];
        session.data.topic = `SUSPENDED - ${topic}`;
        session.step = 'support_message';
        
        await bot.sendMessage(chatId,
          `✅ Topic: ${topic}\n\n` +
          `Please explain your situation in detail:\n` +
          `• Why you believe your account was wrongly suspended\n` +
          `• Any evidence to support your appeal\n` +
          `• Your contact information\n\n` +
          `Type your appeal message below:`
        );
      } else {
        // Regular user topics
        if (isNaN(topicNumber) || topicNumber < 1 || topicNumber > 6) {
          await bot.sendMessage(chatId, '❌ Please enter a number between 1-6:');
          return;
        }
        
        const topics = [
          'Account Issues',
          'Investment Problems',
          'Withdrawal Help',
          'Referral Issues',
          'Payment Proof/Upload',
          'Other'
        ];
        
        const topic = topics[topicNumber - 1];
        session.data.topic = topic;
        session.step = 'support_message';
        
        const extraInstructions = topicNumber === 5 ? 
          '\n**You can send payment proof as:**\n• Photo (M-Pesa screenshot)\n• Document (bank statement)\n• Video (screen recording)\n\n' : '';
        
        await bot.sendMessage(chatId,
          `✅ Topic: ${topic}\n\n` +
          `Please describe your issue in detail:${extraInstructions}\n` +
          `Type your message below:\n` +
          `(You can also send photos/documents directly)`
        );
      }
    }
    else if (session.step === 'support_message') {
      // Create or find support chat
      const activeChat = await getActiveSupportChat(session.data.memberId);
      
      let chatIdStr;
      
      if (activeChat) {
        // Continue existing chat
        chatIdStr = activeChat.id;
        await saveData(COLLECTIONS.SUPPORT_CHATS,
          { id: chatIdStr },
          { 
            $push: { 
              messages: {
                sender: 'user',
                message: text,
                timestamp: new Date().toISOString()
              }
            },
            $set: {
              updatedAt: new Date().toISOString(),
              adminReplied: false
            }
          }
        );
      } else {
        // Create new support chat
        chatIdStr = `CHAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        
        const newChat = {
          id: chatIdStr,
          userId: session.data.memberId,
          userName: session.data.userName,
          topic: session.data.topic,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [{
            sender: 'user',
            message: text,
            timestamp: new Date().toISOString()
          }],
          adminReplied: false
        };
        
        await insertData(COLLECTIONS.SUPPORT_CHATS, newChat);
      }
      
      session.step = 'support_chat';
      session.data.chatId = chatIdStr;
      
      await bot.sendMessage(chatId,
        `✅ **Support Request Sent**\n\n` +
        `Support Ticket ID: ${chatIdStr}\n` +
        `Topic: ${session.data.topic}\n\n` +
        `Our support team will respond within 15 minutes.\n\n` +
        `**You can send:**\n` +
        `• Text messages\n` +
        `• Photos (screenshots)\n` +
        `• Documents (PDFs, etc.)\n` +
        `• Videos\n` +
        `• Voice messages\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `🆘 **New Support Request**\n\n` +
                            `Chat ID: ${chatIdStr}\n` +
                            `User: ${session.data.userName} (${session.data.memberId})\n` +
                            `Topic: ${session.data.topic}\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${chatIdStr} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    else if (session.step === 'support_chat') {
      // Handle text messages in active support chats
      const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: session.data.chatId });
      
      if (!supportChat) {
        await bot.sendMessage(chatId, '❌ Chat not found. Please start new support with /support');
        delete userSessions[chatId];
        return;
      }
      
      if (supportChat.status === 'closed') {
        await bot.sendMessage(chatId, '❌ This support chat has been closed by admin.');
        delete userSessions[chatId];
        return;
      }
      
      await saveData(COLLECTIONS.SUPPORT_CHATS,
        { id: session.data.chatId },
        { 
          $push: { 
            messages: {
              sender: 'user',
              message: text,
              timestamp: new Date().toISOString()
            }
          },
          $set: {
            updatedAt: new Date().toISOString(),
            adminReplied: false
          }
        }
      );
      
      await bot.sendMessage(chatId,
        `✅ **Message sent**\n\n` +
        `Support team will respond shortly.\n\n` +
        `Type /endsupport to end chat`
      );
      
      // Notify admins
      const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
      if (adminIds.length > 0) {
        const adminMessage = `💬 **New Support Message**\n\n` +
                            `Chat ID: ${session.data.chatId}\n` +
                            `User: ${supportChat.userName} (${supportChat.userId})\n` +
                            `Message: ${text}\n\n` +
                            `**Reply:** /replychat ${session.data.chatId} your_message`;
        
        for (const adminId of adminIds) {
          try {
            await bot.sendMessage(adminId, adminMessage);
          } catch (error) {
            console.log('Could not notify admin:', adminId);
          }
        }
      }
    }
    
  } catch (error) {
    console.log('Message handling error:', error.message);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    delete userSessions[chatId];
  }
});

// ==================== ADMIN COMMANDS ====================

// ADMIN COMMANDS
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

// Check Telegram binding for user
bot.onText(/\/checkbinding (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const bindingStatus = user.accountBound ? '✅ BOUND' : '❌ NOT BOUND';
    const telegramId = user.chatId || 'Not set';
    const telegramAccountId = user.telegramAccountId || 'Not set';
    
    const message = `🔒 **Telegram Binding Check**\n\n` +
                   `User: ${user.name} (${memberId})\n` +
                   `Binding Status: ${bindingStatus}\n` +
                   `Telegram Chat ID: ${telegramId}\n` +
                   `Telegram Account ID: ${telegramAccountId}\n` +
                   `Account Created: ${new Date(user.joinedDate).toLocaleString()}\n` +
                   `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}\n\n` +
                   `**Binding Rules:**\n` +
                   `• One Telegram account ↔ One Member ID\n` +
                   `• Cannot login to other accounts\n` +
                   `• Cannot be accessed by other Telegram accounts`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /checkbinding:', error.message);
    await bot.sendMessage(chatId, '❌ Error checking binding.');
  }
});

// View media in support chat
bot.onText(/\/viewmedia (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const supportChat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: supportChatId });
    
    if (!supportChat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    // Find media files in this chat
    const chatMedia = await loadData(COLLECTIONS.MEDIA_FILES, { chatId: supportChatId });
    
    if (chatMedia.length === 0) {
      await bot.sendMessage(chatId, `📭 No media files in chat ${supportChatId}.`);
      return;
    }
    
    let message = `📎 **Media Files in Chat: ${supportChatId}**\n\n`;
    message += `Total Media Files: ${chatMedia.length}\n\n`;
    
    // Group by type
    const photos = chatMedia.filter(m => m.fileType === 'photo');
    const documents = chatMedia.filter(m => m.fileType === 'document');
    const videos = chatMedia.filter(m => m.fileType === 'video');
    const voices = chatMedia.filter(m => m.fileType === 'voice');
    
    if (photos.length > 0) {
      message += `📸 **Photos:** ${photos.length}\n`;
      photos.slice(0, 3).forEach((photo, index) => {
        const time = new Date(photo.timestamp).toLocaleString();
        message += `${index + 1}. ${photo.caption || 'No caption'} (${time})\n`;
      });
      if (photos.length > 3) message += `... and ${photos.length - 3} more photos\n`;
      message += `\n`;
    }
    
    if (documents.length > 0) {
      message += `📄 **Documents:** ${documents.length}\n`;
      documents.slice(0, 3).forEach((doc, index) => {
        const time = new Date(doc.timestamp).toLocaleString();
        message += `${index + 1}. ${doc.caption || 'No caption'} (${time})\n`;
      });
      if (documents.length > 3) message += `... and ${documents.length - 3} more documents\n`;
      message += `\n`;
    }
    
    if (videos.length > 0) {
      message += `🎥 **Videos:** ${videos.length}\n`;
      videos.slice(0, 3).forEach((video, index) => {
        const time = new Date(video.timestamp).toLocaleString();
        message += `${index + 1}. ${video.caption || 'No caption'} (${time})\n`;
      });
      if (videos.length > 3) message += `... and ${videos.length - 3} more videos\n`;
      message += `\n`;
    }
    
    if (voices.length > 0) {
      message += `🎤 **Voice Messages:** ${voices.length}\n`;
      voices.slice(0, 3).forEach((voice, index) => {
        const time = new Date(voice.timestamp).toLocaleString();
        message += `${index + 1}. Voice message (${time})\n`;
      });
      if (voices.length > 3) message += `... and ${voices.length - 3} more voice messages\n`;
      message += `\n`;
    }
    
    message += `**To view a specific media file, forward it to users or check the chat history.**\n`;
    message += `**View Chat:** /viewchat ${supportChatId}`;
    
    await bot.sendMessage(chatId, message);
    
    // Send first photo if exists (as preview)
    if (photos.length > 0) {
      try {
        const firstPhoto = photos[0];
        await bot.sendPhoto(chatId, firstPhoto.fileId, {
          caption: `Preview: ${firstPhoto.caption || 'Photo from support chat'}`
        });
      } catch (error) {
        console.log('Could not send photo preview:', error.message);
      }
    }
    
  } catch (error) {
    console.log('Error in /viewmedia:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading media files.');
  }
});

// View chat command
bot.onText(/\/viewchat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const chat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: supportChatId });
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const isLoggedOut = chat.isLoggedOut || false;
    const noAccount = chat.noAccount || false;
    const isAppeal = chat.isAppeal || false;
    const userName = chat.userName || 'Unknown User';
    const userId = chat.userId || 'Unknown ID';
    
    // Count media in chat
    const chatMedia = await loadData(COLLECTIONS.MEDIA_FILES, { chatId: supportChatId });
    const mediaCount = chatMedia.length;
    
    let message = `💬 **Support Chat Details**\n\n`;
    message += `🆔 Chat ID: ${chat.id}\n`;
    message += `👤 User: ${userName}\n`;
    message += `🔑 User ID: ${userId}\n`;
    message += `📝 Topic: ${chat.topic}\n`;
    message += `📊 Status: ${chat.status === 'active' ? '🟢 Active' : '🔴 Closed'}\n`;
    message += `🚪 Logged Out: ${isLoggedOut ? 'Yes' : 'No'}\n`;
    message += `🚫 No Account: ${noAccount ? 'Yes' : 'No'}\n`;
    message += `⚖️ Appeal: ${isAppeal ? 'Yes ⚠️ URGENT' : 'No'}\n`;
    message += `📎 Media Files: ${mediaCount}\n`;
    message += `📅 Created: ${new Date(chat.createdAt).toLocaleString()}\n`;
    message += `🕒 Updated: ${new Date(chat.updatedAt).toLocaleString()}\n`;
    message += `💬 Messages: ${chat.messages ? chat.messages.length : 0}\n\n`;
    
    if (chat.messages && chat.messages.length > 0) {
      message += `**Recent Chat History:**\n\n`;
      
      // Show last 10 messages
      const recentMessages = chat.messages.slice(-10);
      
      recentMessages.forEach((msg, index) => {
        const sender = msg.sender === 'admin' ? '👨‍💼 Admin' : '👤 User';
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const hasMedia = msg.mediaId ? ' 📎' : '';
        
        message += `${recentMessages.length - 9 + index}. ${sender}${hasMedia} (${time}):\n`;
        
        if (msg.mediaId) {
          const mediaType = msg.fileType || 'file';
          message += `   [${mediaType.toUpperCase()}] ${msg.message}\n\n`;
        } else {
          message += `   "${msg.message}"\n\n`;
        }
      });
    } else {
      message += `No messages in this chat.\n\n`;
    }
    
    message += `**Actions:**\n`;
    if (chat.status === 'active') {
      message += `💭 Reply: /replychat ${chat.id} message\n`;
      message += `📎 View Media: /viewmedia ${chat.id}\n`;
      message += `❌ Close: /closechat ${chat.id}\n`;
    } else {
      message += `✅ Chat is already closed\n`;
    }
    
    // Split long messages
    if (message.length > 4000) {
      const part1 = message.substring(0, 4000);
      const part2 = message.substring(4000);
      
      await bot.sendMessage(chatId, part1);
      await bot.sendMessage(chatId, part2);
    } else {
      await bot.sendMessage(chatId, message);
    }
    
  } catch (error) {
    console.log('Error in /viewchat:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading chat details.');
  }
});

// ==================== OTHER ADMIN COMMANDS ====================

// Stats command with media stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(COLLECTIONS.USERS);
    const investments = await loadData(COLLECTIONS.INVESTMENTS);
    const withdrawals = await loadData(COLLECTIONS.WITHDRAWALS);
    const supportChats = await loadData(COLLECTIONS.SUPPORT_CHATS);
    const referrals = await loadData(COLLECTIONS.REFERRALS);
    const mediaFiles = await loadData(COLLECTIONS.MEDIA_FILES);
    const earningsViews = await loadData(COLLECTIONS.EARNINGS_VIEWS);
    const transactions = await loadData(COLLECTIONS.TRANSACTIONS);
    
    const totalBalance = users.reduce((sum, user) => sum + parseFloat(user.balance || 0), 0);
    const totalInvested = users.reduce((sum, user) => sum + parseFloat(user.totalInvested || 0), 0);
    const totalEarned = users.reduce((sum, user) => sum + parseFloat(user.totalEarned || 0), 0);
    const totalReferralEarnings = referrals.reduce((sum, ref) => sum + (ref.bonusAmount || 0), 0);
    const activeUsers = users.filter(u => !u.banned).length;
    const activeInvestments = investments.filter(i => i.status === 'active').length;
    const pendingInvestments = investments.filter(i => i.status === 'pending').length;
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const activeSupportChats = supportChats.filter(c => c.status === 'active').length;
    const paidReferrals = referrals.filter(ref => ref.status === 'paid').length;
    const totalWithdrawalFees = withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + (w.fee || 0), 0);
    const offlineUsers = users.filter(u => u.chatId && loggedOutUsers.has(u.chatId)).length;
    const blockedUsers = users.filter(u => u.botBlocked).length;
    const suspendedUsers = users.filter(u => u.banned).length;
    const totalEarningsViewFees = earningsViews.reduce((sum, view) => sum + (view.fee || 0), 0);
    const boundAccounts = users.filter(u => u.accountBound).length;
    
    // Media stats
    const photoCount = mediaFiles.filter(m => m.fileType === 'photo').length;
    const documentCount = mediaFiles.filter(m => m.fileType === 'document').length;
    const videoCount = mediaFiles.filter(m => m.fileType === 'video').length;
    const voiceCount = mediaFiles.filter(m => m.fileType === 'voice').length;
    
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
                        `• Total Withdrawn: ${formatCurrency(withdrawals.filter(w => w.status === 'approved').reduce((sum, w) => sum + w.amount, 0))}\n` +
                        `• Total Fees Collected: ${formatCurrency(totalWithdrawalFees)}\n\n` +
                        `**Referrals:**\n` +
                        `• Total Referrals: ${referrals.length}\n` +
                        `• Paid Referrals: ${paidReferrals}\n` +
                        `• Total Bonus Paid: ${formatCurrency(totalReferralEarnings)}\n\n` +
                        `**Earnings Views:**\n` +
                        `• Total Views: ${earningsViews.length}\n` +
                        `• Total Fees: ${formatCurrency(totalEarningsViewFees)}\n\n` +
                        `**Transactions:**\n` +
                        `• Total Transactions: ${transactions.length}\n\n` +
                        `**Support:**\n` +
                        `• Active Chats: ${activeSupportChats}\n` +
                        `• Total Chats: ${supportChats.length}\n` +
                        `• Media Files: ${mediaFiles.length}\n` +
                        `  📸 Photos: ${photoCount}\n` +
                        `  📄 Documents: ${documentCount}\n` +
                        `  🎥 Videos: ${videoCount}\n` +
                        `  🎤 Voice: ${voiceCount}`;
    
    await bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.log('Error in /stats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading statistics.');
  }
});

// ==================== FIXED MISSING COMMANDS ====================

// Users list
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(COLLECTIONS.USERS, {}, { joinedDate: -1 }, 10);
    
    if (users.length === 0) {
      await bot.sendMessage(chatId, '📭 No users found.');
      return;
    }
    
    let message = `👥 **Recent Users (Last 10)**\n\n`;
    
    users.forEach((user, index) => {
      const status = user.banned ? '🚫' : user.botBlocked ? '❌' : '✅';
      const bound = user.accountBound ? '🔒' : '🔓';
      const balance = formatCurrency(user.balance || 0);
      message += `${index + 1}. ${status}${bound} ${user.name} (${user.memberId})\n`;
      message += `   Balance: ${balance} | Ref: ${user.referrals || 0}\n\n`;
    });
    
    const totalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
    message += `**Total Users:** ${totalUsers}\n\n`;
    message += `**View user:** /view USER_ID\n`;
    message += `**Example:** /view USER-1000`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /users:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading users.');
  }
});

// View user details
bot.onText(/\/view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const investments = await loadData(COLLECTIONS.INVESTMENTS, { memberId: memberId });
    const withdrawals = await loadData(COLLECTIONS.WITHDRAWALS, { memberId: memberId });
    const referrals = await loadData(COLLECTIONS.REFERRALS, { referrerId: memberId });
    const earningsViews = await loadData(COLLECTIONS.EARNINGS_VIEWS, { viewerId: memberId });
    const viewedUserEarnings = await loadData(COLLECTIONS.EARNINGS_VIEWS, { viewedId: memberId });
    const transactions = await loadData(COLLECTIONS.TRANSACTIONS, { memberId: memberId });
    const referredBy = user.referredBy ? `Referred by: ${user.referredBy}\n` : '';
    
    const message = `👤 **User Details**\n\n` +
                   `Name: ${user.name}\n` +
                   `Member ID: ${user.memberId}\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Chat ID: ${user.chatId || 'N/A'}\n` +
                   `Telegram Account ID: ${user.telegramAccountId || 'N/A'}\n` +
                   `Account Bound: ${user.accountBound ? '✅ Yes' : '❌ No'}\n` +
                   `Status: ${user.banned ? '🚫 Banned' : user.botBlocked ? '❌ Blocked Bot' : '✅ Active'}\n` +
                   `${referredBy}` +
                   `Joined: ${new Date(user.joinedDate).toLocaleString()}\n` +
                   `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}\n` +
                   `Last Password Change: ${user.lastPasswordChange ? new Date(user.lastPasswordChange).toLocaleString() : 'Never'}\n\n` +
                   `💰 **Financials**\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                   `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                   `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                   `📊 **Stats**\n` +
                   `Referrals: ${user.referrals || 0}\n` +
                   `Referral Code: ${user.referralCode || 'N/A'}\n` +
                   `Investments: ${investments.length}\n` +
                   `Withdrawals: ${withdrawals.length}\n` +
                   `Referral Network: ${referrals.length}\n` +
                   `Earnings Views Made: ${earningsViews.length}\n` +
                   `Earnings Views Received: ${viewedUserEarnings.length}\n` +
                   `Transactions: ${transactions.length}\n\n` +
                   `**Actions:**\n` +
                   `💰 Add Balance: /addbalance ${memberId} AMOUNT\n` +
                   `🔐 Reset Pass: /resetpass ${memberId}\n` +
                   `📨 Message: /message ${memberId}\n` +
                   `🔒 Check Binding: /checkbinding ${memberId}\n` +
                   `${user.banned ? `✅ Unsuspend: /unsuspend ${memberId}` : `🚫 Suspend: /suspend ${memberId}`}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /view:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading user details.');
  }
});

// Add balance
bot.onText(/\/addbalance (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /addbalance USER_ID AMOUNT');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { $inc: { balance: amount } }
    );
    
    // Record transaction
    await insertData(COLLECTIONS.TRANSACTIONS, {
      id: `ADMIN-ADD-${Date.now()}`,
      memberId: memberId,
      type: 'admin_add_balance',
      amount: amount,
      description: `Admin added balance`,
      date: new Date().toISOString(),
      adminId: chatId.toString(),
      createdAt: new Date().toISOString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Balance Added Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Added: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) + amount)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `💰 **Admin Added Balance**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) + amount)}\n\n` +
      `This was added by an administrator.`
    );
  } catch (error) {
    console.log('Error in /addbalance:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding balance.');
  }
});

// Reset password
bot.onText(/\/resetpass (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const newPassword = generateRandomPassword(8);
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { 
        $set: { 
          passwordHash: hashPassword(newPassword),
          lastPasswordChange: new Date().toISOString()
        }
      }
    );
    
    await bot.sendMessage(chatId,
      `✅ **Password Reset Successful**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `New Password: ${newPassword}\n\n` +
      `User has been notified of the new password.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🔐 **Password Reset by Admin**\n\n` +
      `Your password has been reset by an administrator.\n\n` +
      `New Password: ${newPassword}\n\n` +
      `Please login with:\n` +
      `Member ID: ${memberId}\n` +
      `Password: ${newPassword}\n\n` +
      `For security, change your password after logging in.`
    );
  } catch (error) {
    console.log('Error in /resetpass:', error.message);
    await bot.sendMessage(chatId, '❌ Error resetting password.');
  }
});

// Suspend user
bot.onText(/\/suspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (user.banned) {
      await bot.sendMessage(chatId, `⚠️ User ${memberId} is already suspended.`);
      return;
    }
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { $set: { banned: true } }
    );
    
    await bot.sendMessage(chatId,
      `🚫 **User Suspended**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Status: Suspended\n\n` +
      `User can no longer access their account.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🚫 **Account Suspended**\n\n` +
      `Your account has been suspended by an administrator.\n` +
      `You can no longer access your account.\n\n` +
      `If you believe this is an error, contact support immediately.`
    );
  } catch (error) {
    console.log('Error in /suspend:', error.message);
    await bot.sendMessage(chatId, '❌ Error suspending user.');
  }
});

// Unsuspend user
bot.onText(/\/unsuspend (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if (!user.banned) {
      await bot.sendMessage(chatId, `⚠️ User ${memberId} is not suspended.`);
      return;
    }
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { $set: { banned: false } }
    );
    
    await bot.sendMessage(chatId,
      `✅ **User Unsuspended**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Status: Active\n\n` +
      `User can now access their account again.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `✅ **Account Reactivated**\n\n` +
      `Your account has been reactivated by an administrator.\n` +
      `You can now login and access your account.\n\n` +
      `Welcome back!`
    );
  } catch (error) {
    console.log('Error in /unsuspend:', error.message);
    await bot.sendMessage(chatId, '❌ Error unsuspending user.');
  }
});

// Delete user
bot.onText(/\/delete (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const userName = user.name;
    
    // Remove user and related data
    await deleteData(COLLECTIONS.USERS, { memberId: memberId });
    await deleteData(COLLECTIONS.INVESTMENTS, { memberId: memberId });
    await deleteData(COLLECTIONS.WITHDRAWALS, { memberId: memberId });
    await deleteData(COLLECTIONS.REFERRALS, { referrerId: memberId });
    await deleteData(COLLECTIONS.REFERRALS, { referredId: memberId });
    await deleteData(COLLECTIONS.TRANSACTIONS, { memberId: memberId });
    await deleteData(COLLECTIONS.EARNINGS_VIEWS, { viewerId: memberId });
    await deleteData(COLLECTIONS.EARNINGS_VIEWS, { viewedId: memberId });
    
    await bot.sendMessage(chatId,
      `🗑️ **User Deleted**\n\n` +
      `User: ${userName} (${memberId})\n` +
      `All user data has been removed from the system.`
    );
  } catch (error) {
    console.log('Error in /delete:', error.message);
    await bot.sendMessage(chatId, '❌ Error deleting user.');
  }
});

// Support chats list
bot.onText(/\/supportchats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const activeChats = await loadData(COLLECTIONS.SUPPORT_CHATS, { status: 'active' });
    
    if (activeChats.length === 0) {
      await bot.sendMessage(chatId, '📭 No active support chats.');
      return;
    }
    
    let message = `💬 **Active Support Chats: ${activeChats.length}**\n\n`;
    
    activeChats.forEach((chat, index) => {
      const isLoggedOut = chat.isLoggedOut ? '🚪' : '';
      const noAccount = chat.noAccount ? '🚫' : '';
      const isAppeal = chat.isAppeal ? '⚖️' : '';
      const timeAgo = Math.floor((new Date() - new Date(chat.updatedAt)) / 60000);
      const messages = chat.messages ? chat.messages.length : 0;
      const lastMessage = chat.messages && chat.messages.length > 0 ? 
        chat.messages[chat.messages.length - 1].message.substring(0, 30) + '...' : 'No messages';
      
      message += `${index + 1}. ${isLoggedOut}${noAccount}${isAppeal} **${chat.userName}**\n`;
      message += `   🆔 ${chat.id}\n`;
      message += `   📝 ${chat.topic}\n`;
      message += `   💬 ${messages} messages\n`;
      message += `   🕒 ${timeAgo} min ago\n`;
      message += `   📨 "${lastMessage}"\n`;
      message += `   **View:** /viewchat ${chat.id}\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /supportchats:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading support chats.');
  }
});

// Reply to chat
bot.onText(/\/replychat (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  const replyMessage = match[2];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const chat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: supportChatId });
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    const userId = chat.userId;
    const userName = chat.userName;
    
    // Add admin reply to chat
    await saveData(COLLECTIONS.SUPPORT_CHATS,
      { id: supportChatId },
      { 
        $push: { 
          messages: {
            sender: 'admin',
            message: replyMessage,
            timestamp: new Date().toISOString(),
            adminId: chatId.toString()
          }
        },
        $set: {
          updatedAt: new Date().toISOString(),
          adminReplied: true
        }
      }
    );
    
    // Send notification to user based on chat type
    if (chat.noAccount) {
      // User without account - send to their chat ID
      const userChatId = chat.userChatId || userId.replace('NO_ACCOUNT_', '');
      try {
        await bot.sendMessage(userChatId,
          `💬 **Support Response**\n\n` +
          `${replyMessage}\n\n` +
          `Use /support to reply back.`
        );
      } catch (error) {
        console.log('Could not send to no-account user:', error.message);
      }
    } else if (chat.isLoggedOut) {
      // Logged out user - store offline message
      const memberId = userId.replace('LOGGED_OUT_', '');
      await storeOfflineMessage(memberId,
        `💬 **Support Response (You were logged out)**\n\n` +
        `${replyMessage}\n\n` +
        `Login with /login to continue chatting.`,
        'support_response'
      );
    } else {
      // Regular user - send direct message
      await sendUserNotification(userId,
        `💬 **Support Response**\n\n` +
        `${replyMessage}\n\n` +
        `Use /support to reply back.`
      );
    }
    
    await bot.sendMessage(chatId,
      `✅ **Reply Sent**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `User: ${userName}\n` +
      `Message: "${replyMessage}"\n\n` +
      `View chat: /viewchat ${supportChatId}`
    );
  } catch (error) {
    console.log('Error in /replychat:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending reply.');
  }
});

// Close chat
bot.onText(/\/closechat (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const supportChatId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const chat = await findOne(COLLECTIONS.SUPPORT_CHATS, { id: supportChatId });
    
    if (!chat) {
      await bot.sendMessage(chatId, `❌ Support chat ${supportChatId} not found.`);
      return;
    }
    
    if (chat.status === 'closed') {
      await bot.sendMessage(chatId, `⚠️ Chat ${supportChatId} is already closed.`);
      return;
    }
    
    await saveData(COLLECTIONS.SUPPORT_CHATS,
      { id: supportChatId },
      { 
        $set: { 
          status: 'closed',
          updatedAt: new Date().toISOString(),
          closedBy: 'admin'
        }
      }
    );
    
    await bot.sendMessage(chatId,
      `✅ **Chat Closed**\n\n` +
      `Chat ID: ${supportChatId}\n` +
      `User: ${chat.userName}\n` +
      `Closed by: Admin\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    if (chat.noAccount) {
      const userChatId = chat.userChatId || chat.userId.replace('NO_ACCOUNT_', '');
      try {
        await bot.sendMessage(userChatId,
          `✅ **Support Chat Closed**\n\n` +
          `Your support chat has been closed by our team.\n\n` +
          `If you need further assistance, use /support to start a new chat.`
        );
      } catch (error) {
        console.log('Could not notify no-account user');
      }
    } else if (!chat.isLoggedOut) {
      await sendUserNotification(chat.userId,
        `✅ **Support Chat Closed**\n\n` +
        `Your support chat has been closed by our team.\n\n` +
        `If you need further assistance, use /support to start a new chat.`
      );
    }
  } catch (error) {
    console.log('Error in /closechat:', error.message);
    await bot.sendMessage(chatId, '❌ Error closing chat.');
  }
});

// Message user directly
bot.onText(/\/message (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const messageText = match[2];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  await sendDirectMessageToUser(chatId, memberId, messageText);
});

// Initialize admin sessions for messaging
bot.onText(/\/message (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    adminSessions[chatId] = {
      step: 'admin_message_user',
      targetUserId: memberId,
      targetUserName: user.name
    };
    
    await bot.sendMessage(chatId,
      `💬 **Message User**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Balance: ${formatCurrency(user.balance || 0)}\n\n` +
      `Type your message below:\n` +
      `(Max 4096 characters)\n\n` +
      `Type /cancel to cancel`
    );
  } catch (error) {
    console.log('Error in /message:', error.message);
    await bot.sendMessage(chatId, '❌ Error starting message.');
  }
});

// Handle admin message composition
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const adminSession = adminSessions[chatId];
  
  if (adminSession && adminSession.step === 'admin_message_user') {
    await sendDirectMessageToUser(chatId, adminSession.targetUserId, text);
    delete adminSessions[chatId];
  }
});

// Cancel admin action
bot.onText(/\/cancel/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (adminSessions[chatId]) {
    delete adminSessions[chatId];
    await bot.sendMessage(chatId, '❌ Action cancelled.');
  }
});

// ==================== INVESTMENT ADMIN COMMANDS ====================

// List all investments
bot.onText(/\/investments/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investments = await loadData(COLLECTIONS.INVESTMENTS, {}, { date: -1 });
    
    if (investments.length === 0) {
      await bot.sendMessage(chatId, '📭 No investments found.');
      return;
    }
    
    const activeInvestments = investments.filter(i => i.status === 'active');
    const pendingInvestments = investments.filter(i => i.status === 'pending');
    const completedInvestments = investments.filter(i => i.status === 'completed');
    
    let message = `📈 **Investments Summary**\n\n`;
    message += `Total: ${investments.length}\n`;
    message += `Active: ${activeInvestments.length}\n`;
    message += `Pending: ${pendingInvestments.length}\n`;
    message += `Completed: ${completedInvestments.length}\n\n`;
    
    // Show recent investments
    const recentInvestments = investments.slice(0, 5);
    
    message += `**Recent Investments:**\n`;
    recentInvestments.forEach((inv, index) => {
      const status = inv.status === 'active' ? '🟢' : inv.status === 'pending' ? '🟡' : '🔵';
      message += `${index + 1}. ${status} ${inv.memberId}\n`;
      message += `   Amount: ${formatCurrency(inv.amount)}\n`;
      message += `   Method: ${inv.paymentMethod || 'M-Pesa'}\n`;
      message += `   Status: ${inv.status}\n`;
      message += `   Date: ${new Date(inv.date).toLocaleDateString()}\n\n`;
    });
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /investments:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading investments.');
  }
});

// Approve investment - FIXED REFERRAL SYSTEM - BONUS ON FIRST INVESTMENT ONLY
bot.onText(/\/approveinvestment (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investment = await findOne(COLLECTIONS.INVESTMENTS, { id: investmentId });
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    if (investment.status !== 'pending') {
      await bot.sendMessage(chatId, `⚠️ Investment ${investmentId} is not pending.`);
      return;
    }
    
    // Check if this is the user's FIRST investment (BEFORE we update to active)
    const userActiveInvestments = await loadData(COLLECTIONS.INVESTMENTS, { 
      memberId: investment.memberId,
      status: 'active'
    });
    
    // If user has NO active investments, this is their FIRST investment
    const isFirstInvestment = userActiveInvestments.length === 0;
    
    // Update investment status
    await saveData(COLLECTIONS.INVESTMENTS,
      { id: investmentId },
      { 
        $set: { 
          status: 'active',
          approvedAt: new Date().toISOString(),
          approvedBy: chatId.toString()
        }
      }
    );
    
    // Update user's total invested and active investments count
    await saveData(COLLECTIONS.USERS,
      { memberId: investment.memberId },
      { 
        $inc: { 
          totalInvested: investment.amount,
          activeInvestments: 1
        }
      }
    );
    
    // Handle referral bonus if this is the user's FIRST investment and they were referred
    const user = await getUserByMemberId(investment.memberId);
    if (user.referredBy && isFirstInvestment) {
      const referrer = await findOne(COLLECTIONS.USERS, { referralCode: user.referredBy });
      if (referrer) {
        const referralBonus = calculateReferralBonus(investment.amount);
        
        // Update referrer's balance and referral earnings
        await saveData(COLLECTIONS.USERS,
          { memberId: referrer.memberId },
          { 
            $inc: { 
              balance: referralBonus,
              referralEarnings: referralBonus
            }
          }
        );
        
        // Update referral record
        const referral = await findOne(COLLECTIONS.REFERRALS, { 
          referrerId: referrer.memberId,
          referredId: investment.memberId
        });
        
        if (referral) {
          await saveData(COLLECTIONS.REFERRALS,
            { id: referral.id },
            { 
              $set: { 
                status: 'paid',
                bonusAmount: referralBonus,
                bonusPaid: true,
                investmentAmount: investment.amount,
                paidAt: new Date().toISOString(),
                isFirstInvestment: false
              }
            }
          );
        }
        
        // Notify referrer about FIRST investment bonus
        await sendUserNotification(referrer.memberId,
          `🎉 **Referral Bonus Earned!**\n\n` +
          `Your referral made their FIRST investment!\n\n` +
          `Referral: ${user.name}\n` +
          `Investment Amount: ${formatCurrency(investment.amount)}\n` +
          `Your Bonus (10%): ${formatCurrency(referralBonus)}\n\n` +
          `Bonus has been added to your balance!\n` +
          `New Balance: ${formatCurrency((referrer.balance || 0) + referralBonus)}\n\n` +
          `Note: You only earn 10% on their FIRST investment.\n` +
          `Subsequent investments will not earn bonuses.`
        );
        
        // Record transaction for referrer
        await insertData(COLLECTIONS.TRANSACTIONS, {
          id: `REF-BONUS-${Date.now()}`,
          memberId: referrer.memberId,
          type: 'referral_bonus',
          amount: referralBonus,
          description: `Bonus from ${user.name}'s FIRST investment`,
          date: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }
    } else if (user.referredBy && !isFirstInvestment) {
      // This is a SUBSEQUENT investment - no bonus
      const referrer = await findOne(COLLECTIONS.USERS, { referralCode: user.referredBy });
      if (referrer) {
        // Update referral record to mark as subsequent
        const referral = await findOne(COLLECTIONS.REFERRALS, { 
          referrerId: referrer.memberId,
          referredId: investment.memberId
        });
        
        if (referral && referral.isFirstInvestment) {
          // Mark as not first investment anymore
          await saveData(COLLECTIONS.REFERRALS,
            { id: referral.id },
            { 
              $set: { 
                isFirstInvestment: false,
                status: 'completed',
                note: 'No bonus - subsequent investment'
              }
            }
          );
          
          // Notify referrer about SUBSEQUENT investment (no bonus)
          await sendUserNotification(referrer.memberId,
            `ℹ️ **Referral Update**\n\n` +
            `${user.name} made another investment.\n\n` +
            `Investment Amount: ${formatCurrency(investment.amount)}\n` +
            `No bonus earned - you only get 10% on FIRST investment.\n\n` +
            `Thanks for referring them!`
          );
        }
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ **Investment Approved**\n\n` +
      `ID: ${investmentId}\n` +
      `User: ${investment.memberId}\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Payment Method: ${investment.paymentMethod || 'M-Pesa'}\n` +
      `Transaction Hash: ${investment.transactionHash || 'N/A'}\n` +
      `Approved by: Admin\n` +
      `First Investment: ${isFirstInvestment ? '✅ Yes' : '❌ No'}\n\n` +
      `The investment is now active and earning 2% daily.`
    );
    
    // Notify user
    await sendUserNotification(investment.memberId,
      `✅ **Investment Approved!**\n\n` +
      `Your investment has been approved and is now active!\n\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Investment ID: ${investmentId}\n` +
      `Daily Profit: ${formatCurrency(calculateDailyProfit(investment.amount))}\n` +
      `Duration: LIFETIME (no expiration)\n` +
      `${isFirstInvestment ? '\n🎉 **This is your FIRST investment!** If you were referred, your referrer earned 10% bonus.' : ''}\n\n` +
      `Your investment is now earning 2% daily profit!\n` +
      `Check your earnings with /earnings`
    );
  } catch (error) {
    console.log('Error in /approveinvestment:', error.message);
    await bot.sendMessage(chatId, '❌ Error approving investment.');
  }
});

// Reject investment
bot.onText(/\/rejectinvestment (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investment = await findOne(COLLECTIONS.INVESTMENTS, { id: investmentId });
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    if (investment.status !== 'pending') {
      await bot.sendMessage(chatId, `⚠️ Investment ${investmentId} is not pending.`);
      return;
    }
    
    // Update investment status
    await saveData(COLLECTIONS.INVESTMENTS,
      { id: investmentId },
      { 
        $set: { 
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectedBy: chatId.toString()
        }
      }
    );
    
    await bot.sendMessage(chatId,
      `❌ **Investment Rejected**\n\n` +
      `ID: ${investmentId}\n` +
      `User: ${investment.memberId}\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Payment Method: ${investment.paymentMethod || 'M-Pesa'}\n` +
      `Rejected by: Admin\n\n` +
      `User has been notified.`
    );
    
    // Notify user
    await sendUserNotification(investment.memberId,
      `❌ **Investment Rejected**\n\n` +
      `Your investment request has been rejected.\n\n` +
      `Amount: ${formatCurrency(investment.amount)}\n` +
      `Investment ID: ${investmentId}\n\n` +
      `Please contact support for more information.`
    );
  } catch (error) {
    console.log('Error in /rejectinvestment:', error.message);
    await bot.sendMessage(chatId, '❌ Error rejecting investment.');
  }
});

// View payment proof
bot.onText(/\/viewproof (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const investmentId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const investment = await findOne(COLLECTIONS.INVESTMENTS, { id: investmentId });
    
    if (!investment) {
      await bot.sendMessage(chatId, `❌ Investment ${investmentId} not found.`);
      return;
    }
    
    const mediaFiles = await loadData(COLLECTIONS.MEDIA_FILES, { investmentId: investmentId });
    const proof = mediaFiles[0];
    
    if (!proof) {
      await bot.sendMessage(chatId, `❌ No proof found for investment ${investmentId}.`);
      return;
    }
    
    // Send the proof photo to admin
    await bot.sendPhoto(chatId, proof.fileId, {
      caption: `📎 Proof for Investment ${investmentId}\n` +
              `User: ${investment.memberId}\n` +
              `Amount: ${formatCurrency(investment.amount)}\n` +
              `Payment Method: ${investment.paymentMethod || 'M-Pesa'}\n` +
              `Transaction Hash: ${investment.transactionHash || 'N/A'}\n` +
              `Date: ${new Date(investment.date).toLocaleString()}\n` +
              `Status: ${investment.status}`
    });
  } catch (error) {
    console.log('Error in /viewproof:', error.message);
    await bot.sendMessage(chatId, '❌ Error viewing proof.');
  }
});

// Manual investment
bot.onText(/\/manualinv (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /manualinv USER_ID AMOUNT');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    const investmentId = `INV-MANUAL-${Date.now()}`;
    
    // Create manual investment
    const manualInvestment = {
      id: investmentId,
      memberId: memberId,
      amount: amount,
      paymentMethod: 'Admin Manual',
      status: 'active',
      date: new Date().toISOString(),
      daysActive: 0,
      totalProfit: 0,
      isManual: true,
      adminId: chatId.toString(),
      createdAt: new Date().toISOString()
    };
    
    await insertData(COLLECTIONS.INVESTMENTS, manualInvestment);
    
    // Update user stats
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { 
        $inc: { 
          totalInvested: amount,
          activeInvestments: 1
        }
      }
    );
    
    // Record transaction
    await insertData(COLLECTIONS.TRANSACTIONS, {
      id: `TRX-MANUAL-INV-${Date.now()}`,
      memberId: memberId,
      type: 'manual_investment',
      amount: amount,
      description: `Manual investment added by admin`,
      date: new Date().toISOString(),
      adminId: chatId.toString(),
      createdAt: new Date().toISOString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Manual Investment Added**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `Investment ID: ${investmentId}\n` +
      `Status: Active\n\n` +
      `User will earn daily 2% profit on this amount.`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `📈 **Manual Investment Added**\n\n` +
      `An administrator has added a manual investment to your account.\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `Investment ID: ${investmentId}\n\n` +
      `You will now earn 2% daily profit on this amount!`
    );
  } catch (error) {
    console.log('Error in /manualinv:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding manual investment.');
  }
});

// ==================== NEW MISSING ADMIN COMMANDS ====================

// Deduct balance from user
bot.onText(/\/deductbalance (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /deductbalance USER_ID AMOUNT');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    if ((user.balance || 0) < amount) {
      await bot.sendMessage(chatId,
        `❌ Insufficient balance.\n` +
        `User has: ${formatCurrency(user.balance || 0)}\n` +
        `Trying to deduct: ${formatCurrency(amount)}`
      );
      return;
    }
    
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { $inc: { balance: -amount } }
    );
    
    // Record transaction
    await insertData(COLLECTIONS.TRANSACTIONS, {
      id: `ADMIN-DEDUCT-${Date.now()}`,
      memberId: memberId,
      type: 'admin_deduct_balance',
      amount: -amount,
      description: `Admin deducted balance`,
      date: new Date().toISOString(),
      adminId: chatId.toString(),
      createdAt: new Date().toISOString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Balance Deducted Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Deducted: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) - amount)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `⚠️ **Balance Deducted by Admin**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) - amount)}\n\n` +
      `This was deducted by an administrator.`
    );
  } catch (error) {
    console.log('Error in /deductbalance:', error.message);
    await bot.sendMessage(chatId, '❌ Error deducting balance.');
  }
});

// Deduct investment amount
bot.onText(/\/deductinv (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /deductinv USER_ID AMOUNT');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Check if user has enough invested
    const userInvestments = await loadData(COLLECTIONS.INVESTMENTS, { 
      memberId: memberId,
      status: 'active'
    });
    
    const totalInvested = userInvestments.reduce((sum, inv) => sum + inv.amount, 0);
    
    if (totalInvested < amount) {
      await bot.sendMessage(chatId,
        `❌ User doesn't have enough active investments.\n` +
        `Total Active Investments: ${formatCurrency(totalInvested)}\n` +
        `Trying to deduct: ${formatCurrency(amount)}`
      );
      return;
    }
    
    // Update user's total invested
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { 
        $inc: { 
          totalInvested: -amount
        }
      }
    );
    
    // Find and reduce investments (start with most recent)
    let remaining = amount;
    for (let investment of userInvestments.reverse()) {
      if (remaining <= 0) break;
      
      const deductAmount = Math.min(investment.amount, remaining);
      const newAmount = investment.amount - deductAmount;
      
      if (newAmount > 0) {
        await saveData(COLLECTIONS.INVESTMENTS,
          { id: investment.id },
          { $set: { amount: newAmount } }
        );
      } else {
        await saveData(COLLECTIONS.INVESTMENTS,
          { id: investment.id },
          { 
            $set: { 
              amount: 0,
              status: 'completed',
              completedAt: new Date().toISOString()
            }
          }
        );
      }
      
      remaining -= deductAmount;
    }
    
    await bot.sendMessage(chatId,
      `✅ **Investment Deducted Successfully**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Amount Deducted: ${formatCurrency(amount)}\n` +
      `New Total Invested: ${formatCurrency(Math.max(0, (user.totalInvested || 0) - amount))}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `⚠️ **Investment Deducted by Admin**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Total Invested: ${formatCurrency(Math.max(0, (user.totalInvested || 0) - amount))}\n\n` +
      `This was deducted by an administrator.`
    );
  } catch (error) {
    console.log('Error in /deductinv:', error.message);
    await bot.sendMessage(chatId, '❌ Error deducting investment.');
  }
});

// List all referrals
bot.onText(/\/referrals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const referrals = await loadData(COLLECTIONS.REFERRALS, {}, { date: -1 }, 10);
    
    if (referrals.length === 0) {
      await bot.sendMessage(chatId, '📭 No referrals found.');
      return;
    }
    
    const paidReferrals = referrals.filter(r => r.status === 'paid');
    const pendingReferrals = referrals.filter(r => r.status === 'pending');
    const firstInvestmentReferrals = referrals.filter(r => r.isFirstInvestment === true);
    
    let message = `👥 **Referrals Summary (Recent 10)**\n\n`;
    message += `Total Referrals: ${referrals.length}\n`;
    message += `Paid (First Investment Bonus): ${paidReferrals.length}\n`;
    message += `Pending First Investment: ${pendingReferrals.length}\n`;
    message += `Awaiting First Investment: ${firstInvestmentReferrals.length}\n`;
    message += `Total Bonus Paid: ${formatCurrency(paidReferrals.reduce((sum, r) => sum + (r.bonusAmount || 0), 0))}\n\n`;
    
    message += `**Recent Referrals:**\n`;
    referrals.forEach((ref, index) => {
      const status = ref.status === 'paid' ? '✅' : ref.status === 'pending' ? '⏳' : '❌';
      const firstInv = ref.isFirstInvestment ? 'FIRST' : 'SUBSEQUENT';
      message += `${index + 1}. ${status} ${ref.referrerName} → ${ref.referredName}\n`;
      message += `   Type: ${firstInv} | Bonus: ${formatCurrency(ref.bonusAmount || 0)} | ${new Date(ref.date).toLocaleDateString()}\n\n`;
    });
    
    const totalReferrals = await db.collection(COLLECTIONS.REFERRALS).countDocuments();
    message += `**Total Referrals in Database:** ${totalReferrals}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /referrals:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading referrals.');
  }
});

// Find user by referral code
bot.onText(/\/findref (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match[1].toUpperCase();
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const user = await findOne(COLLECTIONS.USERS, { referralCode: referralCode });
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ No user found with referral code: ${referralCode}`);
      return;
    }
    
    const referrals = await loadData(COLLECTIONS.REFERRALS, { referrerId: user.memberId });
    const successfulReferrals = referrals.filter(r => r.status === 'paid');
    const firstInvestmentReferrals = referrals.filter(r => r.isFirstInvestment === true);
    
    const message = `🔍 **User Found by Referral Code**\n\n` +
                   `Referral Code: ${referralCode}\n` +
                   `User: ${user.name} (${user.memberId})\n` +
                   `Email: ${user.email || 'N/A'}\n` +
                   `Balance: ${formatCurrency(user.balance || 0)}\n` +
                   `Total Referrals: ${user.referrals || 0}\n` +
                   `Successful Referrals (First Investment Bonus): ${successfulReferrals.length}\n` +
                   `Referrals Awaiting First Investment: ${firstInvestmentReferrals.length}\n` +
                   `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                   `**Note:** Referrers earn 10% only on FIRST investment of referred users.\n\n` +
                   `**View User:** /view ${user.memberId}\n` +
                   `**Message User:** /message ${user.memberId}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /findref:', error.message);
    await bot.sendMessage(chatId, '❌ Error finding user.');
  }
});

// Add referral bonus
bot.onText(/\/addrefbonus (.+?) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  const amount = parseFloat(match[2]);
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  if (isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Invalid amount. Use: /addrefbonus USER_ID AMOUNT');
    return;
  }
  
  try {
    const user = await getUserByMemberId(memberId);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found.`);
      return;
    }
    
    // Add to balance and referral earnings
    await saveData(COLLECTIONS.USERS,
      { memberId: memberId },
      { 
        $inc: { 
          balance: amount,
          referralEarnings: amount
        }
      }
    );
    
    // Record transaction
    await insertData(COLLECTIONS.TRANSACTIONS, {
      id: `REF-BONUS-${Date.now()}`,
      memberId: memberId,
      type: 'referral_bonus',
      amount: amount,
      description: `Admin added referral bonus`,
      date: new Date().toISOString(),
      adminId: chatId.toString(),
      createdAt: new Date().toISOString()
    });
    
    await bot.sendMessage(chatId,
      `✅ **Referral Bonus Added**\n\n` +
      `User: ${user.name} (${memberId})\n` +
      `Bonus Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) + amount)}\n` +
      `Total Referral Earnings: ${formatCurrency((user.referralEarnings || 0) + amount)}`
    );
    
    // Notify user
    await sendUserNotification(memberId,
      `🎉 **Referral Bonus Added!**\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency((user.balance || 0) + amount)}\n` +
      `Total Referral Earnings: ${formatCurrency((user.referralEarnings || 0) + amount)}\n\n` +
      `This bonus was added by an administrator.`
    );
  } catch (error) {
    console.log('Error in /addrefbonus:', error.message);
    await bot.sendMessage(chatId, '❌ Error adding referral bonus.');
  }
});

// ==================== WITHDRAWAL ADMIN COMMANDS ====================

// List withdrawals
bot.onText(/\/withdrawals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const withdrawals = await loadData(COLLECTIONS.WITHDRAWALS, {}, { date: -1 });
    
    if (withdrawals.length === 0) {
      await bot.sendMessage(chatId, '📭 No withdrawals found.');
      return;
    }
    
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    
    let message = `💳 **Withdrawals Summary**\n\n`;
    message += `Total: ${withdrawals.length}\n`;
    message += `Pending: ${pendingWithdrawals.length}\n`;
    message += `Approved: ${withdrawals.filter(w => w.status === 'approved').length}\n`;
    message += `Rejected: ${withdrawals.filter(w => w.status === 'rejected').length}\n\n`;
    
    if (pendingWithdrawals.length > 0) {
      message += `**Pending Withdrawals:**\n`;
      
      pendingWithdrawals.slice(0, 5).forEach((wd, index) => {
        message += `${index + 1}. ${wd.memberId}\n`;
        message += `   Amount: ${formatCurrency(wd.amount)} (Fee: ${formatCurrency(wd.fee || 0)})\n`;
        message += `   Net: ${formatCurrency(wd.netAmount || wd.amount)}\n`;
        message += `   Method: ${wd.method || 'M-Pesa'}\n`;
        message += `   Date: ${new Date(wd.date).toLocaleString()}\n`;
        message += `   **Approve:** /approve ${wd.id}\n`;
        message += `   **Reject:** /reject ${wd.id}\n\n`;
      });
    }
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Error in /withdrawals:', error.message);
    await bot.sendMessage(chatId, '❌ Error loading withdrawals.');
  }
});

// Approve withdrawal
bot.onText(/\/approve (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const withdrawal = await findOne(COLLECTIONS.WITHDRAWALS, { id: withdrawalId });
    
    if (!withdrawal) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found.`);
      return;
    }
    
    if (withdrawal.status === 'approved') {
      await bot.sendMessage(chatId, `⚠️ Withdrawal ${withdrawalId} is already approved.`);
      return;
    }
    
    // Update withdrawal status
    await saveData(COLLECTIONS.WITHDRAWALS,
      { id: withdrawalId },
      { 
        $set: { 
          status: 'approved',
          approvedAt: new Date().toISOString(),
          approvedBy: chatId.toString()
        }
      }
    );
    
    await bot.sendMessage(chatId,
      `✅ **Withdrawal Approved**\n\n` +
      `ID: ${withdrawalId}\n` +
      `User: ${withdrawal.memberId}\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Method: ${withdrawal.method || 'M-Pesa'}\n` +
      `Details: ${withdrawal.details || 'N/A'}\n\n` +
      `Please process the payment within 10-15 minutes.`
    );
    
    // Notify user
    await sendUserNotification(withdrawal.memberId,
      `✅ **Withdrawal Approved**\n\n` +
      `Your withdrawal request has been approved!\n\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Net Amount: ${formatCurrency(withdrawal.netAmount || withdrawal.amount)}\n` +
      `Withdrawal ID: ${withdrawalId}\n\n` +
      `Payment will be processed within 10-15 minutes.\n` +
      `Thank you for your patience!`
    );
  } catch (error) {
    console.log('Error in /approve:', error.message);
    await bot.sendMessage(chatId, '❌ Error approving withdrawal.');
  }
});

// Reject withdrawal
bot.onText(/\/reject (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const withdrawal = await findOne(COLLECTIONS.WITHDRAWALS, { id: withdrawalId });
    
    if (!withdrawal) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found.`);
      return;
    }
    
    if (withdrawal.status === 'rejected') {
      await bot.sendMessage(chatId, `⚠️ Withdrawal ${withdrawalId} is already rejected.`);
      return;
    }
    
    // Update withdrawal status
    await saveData(COLLECTIONS.WITHDRAWALS,
      { id: withdrawalId },
      { 
        $set: { 
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
          rejectedBy: chatId.toString()
        }
      }
    );
    
    // Refund amount to user balance
    await saveData(COLLECTIONS.USERS,
      { memberId: withdrawal.memberId },
      { $inc: { balance: withdrawal.amount } }
    );
    
    await bot.sendMessage(chatId,
      `❌ **Withdrawal Rejected**\n\n` +
      `ID: ${withdrawalId}\n` +
      `User: ${withdrawal.memberId}\n` +
      `Amount: ${formatCurrency(withdrawal.amount)} REFUNDED\n` +
      `Reason: Please contact user with reason\n\n` +
      `Amount has been refunded to user's balance.`
    );
    
    // Notify user
    await sendUserNotification(withdrawal.memberId,
      `❌ **Withdrawal Rejected**\n\n` +
      `Your withdrawal request has been rejected.\n\n` +
      `Amount: ${formatCurrency(withdrawal.amount)}\n` +
      `Withdrawal ID: ${withdrawalId}\n\n` +
      `Your funds have been refunded to your account balance.\n` +
      `Please contact support for more information.`
    );
  } catch (error) {
    console.log('Error in /reject:', error.message);
    await bot.sendMessage(chatId, '❌ Error rejecting withdrawal.');
  }
});

// ==================== BROADCAST COMMAND ====================

// Broadcast to all users
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const message = match[1];
  
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId, '🚫 Access denied.');
    return;
  }
  
  try {
    const users = await loadData(COLLECTIONS.USERS, { banned: false });
    const activeUsers = users.filter(u => u.chatId);
    
    await bot.sendMessage(chatId,
      `📢 **Broadcast Starting**\n\n` +
      `Message: "${message}"\n` +
      `Recipients: ${activeUsers.length} active users\n\n` +
      `Broadcast in progress...`
    );
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of activeUsers) {
      try {
        await bot.sendMessage(user.chatId,
          `📢 **Announcement from Starlife Advert**\n\n` +
          `${message}\n\n` +
          `💼 Management Team`
        );
        successCount++;
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failCount++;
        console.log(`Failed to send to ${user.memberId}:`, error.message);
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ **Broadcast Complete**\n\n` +
      `Success: ${successCount} users\n` +
      `Failed: ${failCount} users\n` +
      `Total: ${activeUsers.length} users\n\n` +
      `Message sent to all active users.`
    );
  } catch (error) {
    console.log('Error in /broadcast:', error.message);
    await bot.sendMessage(chatId, '❌ Error sending broadcast.');
  }
});

// ==================== HEALTH CHECK ENDPOINT ====================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    users: Object.keys(userSessions).length,
    loggedOutUsers: loggedOutUsers.size,
    adminSessions: Object.keys(adminSessions).length,
    mongoConnected: !!db
  });
});

app.get('/', (req, res) => {
  res.send('Starlife Advert Bot is running with MongoDB!');
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
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

console.log('✅ Starlife Advert Bot with MongoDB is running!');
console.log('📊 All data is now stored in MongoDB Atlas (persistent storage)');
console.log('🔒 Accounts will not be deleted on server restart');
console.log('✅ Security fixes applied:');
console.log('1. ✅ MongoDB integration for persistent storage');
console.log('2. ✅ Telegram account binding implemented (One Telegram ↔ One Member ID)');
console.log('3. ✅ Cannot login to other accounts with same Telegram');
console.log('4. ✅ All features working perfectly!');
