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
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];

// Admin credentials (in production, use environment variables)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Initialize data storage
async function initStorage() {
  try {
    // Create files if they don't exist
    const files = [USERS_FILE, SUPPORT_TICKETS_FILE, FAKE_MEMBERS_FILE];
    
    for (const file of files) {
      try {
        await fs.access(file);
      } catch {
        await fs.writeFile(file, JSON.stringify([]));
      }
    }
    
    // Generate fake members if not exists
    const fakeMembers = JSON.parse(await fs.readFile(FAKE_MEMBERS_FILE, 'utf8'));
    if (fakeMembers.length === 0) {
      const initialFakeMembers = generateFakeMembers(50);
      await fs.writeFile(FAKE_MEMBERS_FILE, JSON.stringify(initialFakeMembers, null, 2));
    }
    
    console.log('✅ Storage initialized');
  } catch (error) {
    console.log('❌ Storage initialization failed:', error.message);
  }
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
      isFake: true
    });
  }
  
  return fakeMembers;
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Check if user is admin
function isAdmin(chatId) {
  return ADMIN_IDS.includes(chatId.toString());
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

// Check if member ID exists
async function memberIdExists(memberId, checkFake = false) {
  const users = await loadData(USERS_FILE);
  const existingUser = users.find(user => user.memberId === memberId && !user.isFake);
  
  if (existingUser) return { exists: true, user: existingUser };
  
  if (checkFake) {
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    const fakeMember = fakeMembers.find(member => member.memberId === memberId);
    if (fakeMember) return { exists: true, user: fakeMember, isFake: true };
  }
  
  return { exists: false };
}

// Start server first
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initStorage();
});

// Bot initialization
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

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

// Error handlers
bot.on('polling_error', (error) => {
  console.log('🔧 Polling error:', error.code);
});

// Test bot connection
bot.getMe()
  .then(botInfo => {
    console.log('✅ Bot connected to Telegram:', botInfo.username);
  })
  .catch(error => {
    console.log('❌ Bot failed to connect:', error.message);
  });

// User sessions for registration/login
const userSessions = {};

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.from.username || msg.from.first_name;
  console.log('📱 Received /start from:', chatId);
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    if (user.banned) {
      bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support for assistance.');
      return;
    }
    
    const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                          `Member ID: ${user.memberId}\n` +
                          `Balance: $${user.balance || 0}\n` +
                          `Referrals: ${user.referrals || 0}\n\n` +
                          `Available commands:\n` +
                          `/earnings - Check your earnings\n` +
                          `/withdraw - Withdraw funds\n` +
                          `/profile - View/Edit profile\n` +
                          `/support - Contact support\n` +
                          `/help - Show all commands`;
    
    bot.sendMessage(chatId, welcomeMessage);
  } else {
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
    
    bot.sendMessage(chatId, fakeMembersMessage, { parse_mode: 'Markdown' });
  }
});

// Registration command
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
                 `Step 1/3: Enter your Member ID\n` +
                 `(This should be provided by your organization)\n\n` +
                 `Type your Member ID (e.g., SLA-123):`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Handle registration steps
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
        
        // Check if member ID is valid and not already taken
        const memberCheck = await memberIdExists(memberId, true);
        
        if (memberCheck.exists) {
          if (memberCheck.isFake) {
            bot.sendMessage(chatId, '❌ This Member ID is reserved. Please use your personal Member ID.');
            delete userSessions[chatId];
            return;
          }
          
          if (memberCheck.user.chatId) {
            bot.sendMessage(chatId, '❌ This Member ID is already registered to another user.');
            delete userSessions[chatId];
            return;
          }
        }
        
        // For new members, we'll accept any member ID starting with SLA-
        if (!memberId.startsWith('SLA-')) {
          bot.sendMessage(chatId, '❌ Invalid Member ID format. It should start with SLA- (e.g., SLA-123)');
          delete userSessions[chatId];
          return;
        }
        
        session.data.memberId = memberId;
        session.step = 'awaiting_password';
        
        bot.sendMessage(chatId, `Step 2/3: Create a secure password\n\n` +
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
        
        bot.sendMessage(chatId, `Step 3/3: Enter your full name\n\n` +
                               `Example: John Doe\n` +
                               `Enter your name:`);
        break;
        
      case 'awaiting_name':
        const name = text.trim();
        
        // Create new user
        const newUser = {
          chatId: chatId.toString(),
          memberId: session.data.memberId,
          passwordHash: session.data.passwordHash,
          name: name,
          email: '',
          phone: '',
          balance: 0,
          earnings: 0,
          referrals: 0,
          referralCode: `REF-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          joinedDate: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          banned: false,
          isFake: false,
          requiresPasswordReset: false
        };
        
        // Save user
        const users = await loadData(USERS_FILE);
        users.push(newUser);
        await saveData(USERS_FILE, users);
        
        // Clear session
        delete userSessions[chatId];
        
        // Send success message
        const successMessage = `🎉 **Registration Successful!**\n\n` +
                              `Welcome to Earnings Platform, ${name}!\n\n` +
                              `Your Account Details:\n` +
                              `• Member ID: ${newUser.memberId}\n` +
                              `• Referral Code: ${newUser.referralCode}\n` +
                              `• Join Date: ${new Date().toLocaleDateString()}\n\n` +
                              `Start earning by sharing your referral code!\n\n` +
                              `Use /earnings to check your balance\n` +
                              `Use /withdraw to withdraw funds\n` +
                              `Use /profile to update your information`;
        
        bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });
        
        // Notify admin
        if (ADMIN_IDS.length > 0) {
          const adminMessage = `👤 New User Registered\n\n` +
                              `Name: ${name}\n` +
                              `Member ID: ${newUser.memberId}\n` +
                              `Chat ID: ${chatId}\n` +
                              `Time: ${new Date().toLocaleString()}`;
          
          ADMIN_IDS.forEach(adminId => {
            bot.sendMessage(adminId, adminMessage).catch(console.error);
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

// Login command
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    bot.sendMessage(chatId, '✅ You are already logged in. Use /start to see your dashboard.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'login_member_id',
    data: {}
  };
  
  bot.sendMessage(chatId, '🔑 **Login**\n\nStep 1/2: Enter your Member ID:');
});

// Handle login steps
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session || !session.step.startsWith('login')) return;
  
  try {
    switch (session.step) {
      case 'login_member_id':
        const memberId = text.trim().toUpperCase();
        session.data.memberId = memberId;
        session.step = 'login_password';
        
        bot.sendMessage(chatId, 'Step 2/2: Enter your password:');
        break;
        
      case 'login_password':
        const memberIdToCheck = session.data.memberId;
        const passwordHash = hashPassword(text);
        
        const users = await loadData(USERS_FILE);
        const user = users.find(u => 
          u.memberId === memberIdToCheck && 
          u.passwordHash === passwordHash &&
          !u.isFake
        );
        
        if (user) {
          if (user.banned) {
            bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support for assistance.');
            delete userSessions[chatId];
            return;
          }
          
          // Update chat ID if different
          if (user.chatId !== chatId.toString()) {
            user.chatId = chatId.toString();
            user.lastLogin = new Date().toISOString();
            await saveData(USERS_FILE, users);
          }
          
          delete userSessions[chatId];
          
          const welcomeMessage = `✅ Login Successful!\n\n` +
                                `Welcome back, ${user.name}!\n\n` +
                                `Use /earnings to check your balance\n` +
                                `Use /withdraw to withdraw funds\n` +
                                `Use /profile to manage your account`;
          
          bot.sendMessage(chatId, welcomeMessage);
        } else {
          bot.sendMessage(chatId, '❌ Invalid Member ID or password. Please try /login again.');
          delete userSessions[chatId];
        }
        break;
    }
  } catch (error) {
    console.log('❌ Login error:', error.message);
    bot.sendMessage(chatId, '❌ An error occurred. Please try /login again.');
    delete userSessions[chatId];
  }
});

// Profile command
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ Please login first with /login or register with /register');
    return;
  }
  
  const profileMessage = `👤 **Your Profile**\n\n` +
                        `Name: ${user.name}\n` +
                        `Member ID: ${user.memberId}\n` +
                        `Email: ${user.email || 'Not set'}\n` +
                        `Phone: ${user.phone || 'Not set'}\n` +
                        `Balance: $${user.balance || 0}\n` +
                        `Referrals: ${user.referrals || 0}\n` +
                        `Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n\n` +
                        `**To edit your profile, please contact support.**\n\n` +
                        `Available actions:\n` +
                        `/resetpassword - Reset your password\n` +
                        `/support - Contact support for profile changes`;
  
  bot.sendMessage(chatId, profileMessage, { parse_mode: 'Markdown' });
});

// Reset password command
bot.onText(/\/resetpassword/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  userSessions[chatId] = {
    step: 'reset_password_old',
    data: { memberId: user.memberId }
  };
  
  bot.sendMessage(chatId, '🔐 **Password Reset**\n\nEnter your current password:');
});

// Handle password reset
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session || !session.step.startsWith('reset_password')) return;
  
  try {
    switch (session.step) {
      case 'reset_password_old':
        const oldPasswordHash = hashPassword(text);
        const users = await loadData(USERS_FILE);
        const userIndex = users.findIndex(u => 
          u.memberId === session.data.memberId && 
          u.passwordHash === oldPasswordHash
        );
        
        if (userIndex === -1) {
          bot.sendMessage(chatId, '❌ Current password is incorrect. Please try /resetpassword again.');
          delete userSessions[chatId];
          return;
        }
        
        session.userIndex = userIndex;
        session.step = 'reset_password_new';
        
        bot.sendMessage(chatId, 'Enter your new password (min. 8 characters):');
        break;
        
      case 'reset_password_new':
        if (text.length < 8) {
          bot.sendMessage(chatId, '❌ Password must be at least 8 characters. Please enter again:');
          return;
        }
        
        const users2 = await loadData(USERS_FILE);
        users2[session.userIndex].passwordHash = hashPassword(text);
        users2[session.userIndex].requiresPasswordReset = false;
        
        await saveData(USERS_FILE, users2);
        
        delete userSessions[chatId];
        
        bot.sendMessage(chatId, '✅ Password reset successful! Please login again with /login');
        break;
    }
  } catch (error) {
    console.log('❌ Password reset error:', error.message);
    bot.sendMessage(chatId, '❌ An error occurred. Please try /resetpassword again.');
    delete userSessions[chatId];
  }
});

// Support command
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  userSessions[chatId] = {
    step: 'support_ticket',
    data: {}
  };
  
  const message = `🆘 **Support Ticket**\n\n` +
                 `Please describe your issue:\n` +
                 `1. Account issues\n` +
                 `2. Withdrawal problems\n` +
                 `3. Profile changes\n` +
                 `4. Other\n\n` +
                 `Type your message:`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Handle support tickets
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session || session.step !== 'support_ticket') return;
  
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
    
    const ticket = {
      id: `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      chatId: chatId.toString(),
      memberId: user ? user.memberId : 'GUEST',
      name: user ? user.name : msg.from.first_name,
      message: text,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: []
    };
    
    // Save ticket
    const tickets = await loadData(SUPPORT_TICKETS_FILE);
    tickets.push(ticket);
    await saveData(SUPPORT_TICKETS_FILE, tickets);
    
    delete userSessions[chatId];
    
    // Notify user
    bot.sendMessage(chatId, `✅ Support ticket created!\n\n` +
                           `Ticket ID: ${ticket.id}\n` +
                           `Our team will respond within 24 hours.\n\n` +
                           `You'll be contacted in this chat.`);
    
    // Notify all admins
    if (ADMIN_IDS.length > 0) {
      const adminMessage = `🆘 **New Support Ticket**\n\n` +
                          `Ticket ID: ${ticket.id}\n` +
                          `From: ${ticket.name}\n` +
                          `Member ID: ${ticket.memberId}\n` +
                          `Message: ${text}\n\n` +
                          `Use /admin ticket ${ticket.id} to respond`;
      
      ADMIN_IDS.forEach(adminId => {
        bot.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' }).catch(console.error);
      });
    }
  } catch (error) {
    console.log('❌ Support ticket error:', error.message);
    bot.sendMessage(chatId, '❌ Error creating ticket. Please try /support again.');
    delete userSessions[chatId];
  }
});

// Earnings command - Requires login
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
    // Fetch earnings from external API
    const response = await axios.get(`${WEB_APP_URL}?action=getEarnings&memberId=${encodeURIComponent(user.memberId)}`, {
      timeout: 10000
    });
    
    const data = response.data;
    
    if (data.success) {
      const earningsMessage = `💰 **Your Earnings**\n\n` +
                             `Member ID: ${user.memberId}\n` +
                             `Name: ${user.name}\n\n` +
                             `${data.message}\n\n` +
                             `📊 **Account Summary**\n` +
                             `Total Balance: $${user.balance || 0}\n` +
                             `Referrals: ${user.referrals || 0}\n` +
                             `Referral Code: ${user.referralCode}\n\n` +
                             `Use /withdraw to withdraw funds\n` +
                             `Use /profile to see more details`;
      
      bot.sendMessage(chatId, earningsMessage, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, `❌ ${data.message || 'Unable to fetch earnings. Please try again later.'}`);
    }
  } catch (error) {
    console.log('❌ Earnings fetch error:', error.message);
    bot.sendMessage(chatId, '❌ Error fetching earnings. Please try again in a moment.');
  }
});

// Withdraw command
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString() && !u.isFake);
  
  if (!user) {
    bot.sendMessage(chatId, '❌ Please login first with /login to withdraw funds.');
    return;
  }
  
  if (user.banned) {
    bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support for assistance.');
    return;
  }
  
  if (!user.email || !user.phone) {
    bot.sendMessage(chatId, '❌ Please update your email and phone in your profile before withdrawing.\n\n' +
                           'Contact support with /support to update your profile.');
    return;
  }
  
  if (user.balance < 50) {
    bot.sendMessage(chatId, `❌ Minimum withdrawal amount is $50. Your current balance: $${user.balance || 0}\n\n` +
                           'Continue earning to reach the minimum.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'withdraw_amount',
    data: { memberId: user.memberId }
  };
  
  const message = `💳 **Withdrawal Request**\n\n` +
                 `Current Balance: $${user.balance || 0}\n` +
                 `Minimum Withdrawal: $50\n` +
                 `Payment Method: Bank Transfer\n\n` +
                 `Enter amount to withdraw:`;
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
});

// Handle withdrawal
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session || session.step !== 'withdraw_amount') return;
  
  try {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount < 50) {
      bot.sendMessage(chatId, '❌ Invalid amount. Minimum is $50. Please enter again:');
      return;
    }
    
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
    
    if (userIndex === -1 || users[userIndex].balance < amount) {
      bot.sendMessage(chatId, '❌ Insufficient balance. Please enter a valid amount:');
      return;
    }
    
    // Deduct balance
    users[userIndex].balance -= amount;
    await saveData(USERS_FILE, users);
    
    delete userSessions[chatId];
    
    // Create withdrawal record
    const withdrawal = {
      id: `WD-${Date.now()}`,
      memberId: session.data.memberId,
      amount: amount,
      status: 'pending',
      date: new Date().toISOString(),
      processedBy: null
    };
    
    const successMessage = `✅ Withdrawal request submitted!\n\n` +
                          `Amount: $${amount}\n` +
                          `Transaction ID: ${withdrawal.id}\n` +
                          `New Balance: $${users[userIndex].balance}\n\n` +
                          `Processing time: 3-5 business days\n` +
                          `You'll be notified when processed.`;
    
    bot.sendMessage(chatId, successMessage);
    
    // Notify admin
    if (ADMIN_IDS.length > 0) {
      const adminMessage = `💳 **New Withdrawal Request**\n\n` +
                          `Member ID: ${withdrawal.memberId}\n` +
                          `Amount: $${amount}\n` +
                          `Transaction ID: ${withdrawal.id}\n` +
                          `Balance After: $${users[userIndex].balance}\n\n` +
                          `Use /admin process ${withdrawal.id} to process`;
      
      ADMIN_IDS.forEach(adminId => {
        bot.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' }).catch(console.error);
      });
    }
  } catch (error) {
    console.log('❌ Withdrawal error:', error.message);
    bot.sendMessage(chatId, '❌ Error processing withdrawal. Please try /withdraw again.');
    delete userSessions[chatId];
  }
});

// ============ ADMIN COMMANDS ============

// Admin login
bot.onText(/\/admin login (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const credentials = match[1].split(' ');
  
  if (credentials.length !== 2) {
    bot.sendMessage(chatId, '❌ Usage: /admin login username password');
    return;
  }
  
  const [username, password] = credentials;
  
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    if (!ADMIN_IDS.includes(chatId.toString())) {
      ADMIN_IDS.push(chatId.toString());
    }
    
    bot.sendMessage(chatId, '✅ Admin login successful!\n\n' +
                           'Available admin commands:\n' +
                           '/admin users - List all users\n' +
                           '/admin view MEMBER_ID - View user details\n' +
                           '/admin ban MEMBER_ID - Ban user\n' +
                           '/admin unban MEMBER_ID - Unban user\n' +
                           '/admin reset MEMBER_ID - Reset user password\n' +
                           '/admin delete MEMBER_ID - Delete user\n' +
                           '/admin addfake COUNT - Add fake members\n' +
                           '/admin tickets - View support tickets\n' +
                           '/admin ticket TICKET_ID - View ticket\n' +
                           '/admin respond TICKET_ID - Respond to ticket\n' +
                           '/admin process WD_ID - Process withdrawal');
  } else {
    bot.sendMessage(chatId, '❌ Invalid admin credentials');
  }
});

// Admin commands
bot.onText(/\/admin (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '❌ Admin access required');
    return;
  }
  
  const command = match[1];
  const parts = command.split(' ');
  const action = parts[0];
  
  try {
    switch (action) {
      case 'users':
        const users = await loadData(USERS_FILE);
        const realUsers = users.filter(u => !u.isFake);
        const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
        
        let usersMessage = `👥 **User Statistics**\n\n` +
                          `Real Users: ${realUsers.length}\n` +
                          `Fake Members: ${fakeMembers.length}\n` +
                          `Active Users: ${realUsers.filter(u => !u.banned).length}\n` +
                          `Banned Users: ${realUsers.filter(u => u.banned).length}\n\n` +
                          `**Recent Real Users:**\n`;
        
        const recentUsers = realUsers.slice(-5).reverse();
        recentUsers.forEach(user => {
          usersMessage += `• ${user.name} (${user.memberId}) - $${user.balance}\n`;
        });
        
        bot.sendMessage(chatId, usersMessage, { parse_mode: 'Markdown' });
        break;
        
      case 'view':
        if (parts.length < 2) {
          bot.sendMessage(chatId, '❌ Usage: /admin view MEMBER_ID');
          return;
        }
        
        const memberId = parts[1].toUpperCase();
        const usersData = await loadData(USERS_FILE);
        const targetUser = usersData.find(u => u.memberId === memberId && !u.isFake);
        
        if (!targetUser) {
          bot.sendMessage(chatId, `❌ User with Member ID ${memberId} not found`);
          return;
        }
        
        const userDetails = `👤 **User Details**\n\n` +
                           `Name: ${targetUser.name}\n` +
                           `Member ID: ${targetUser.memberId}\n` +
                           `Chat ID: ${targetUser.chatId}\n` +
                           `Email: ${targetUser.email || 'Not set'}\n` +
                           `Phone: ${targetUser.phone || 'Not set'}\n` +
                           `Balance: $${targetUser.balance || 0}\n` +
                           `Earnings: $${targetUser.earnings || 0}\n` +
                           `Referrals: ${targetUser.referrals || 0}\n` +
                           `Referral Code: ${targetUser.referralCode}\n` +
                           `Joined: ${new Date(targetUser.joinedDate).toLocaleString()}\n` +
                           `Last Login: ${new Date(targetUser.lastLogin).toLocaleString()}\n` +
                           `Status: ${targetUser.banned ? '🚫 BANNED' : '✅ Active'}\n` +
                           `Password Reset Required: ${targetUser.requiresPasswordReset ? 'Yes' : 'No'}`;
        
        bot.sendMessage(chatId, userDetails, { parse_mode: 'Markdown' });
        break;
        
      case 'ban':
        if (parts.length < 2) {
          bot.sendMessage(chatId, '❌ Usage: /admin ban MEMBER_ID');
          return;
        }
        
        const banMemberId = parts[1].toUpperCase();
        const banUsers = await loadData(USERS_FILE);
        const banUserIndex = banUsers.findIndex(u => u.memberId === banMemberId && !u.isFake);
        
        if (banUserIndex === -1) {
          bot.sendMessage(chatId, `❌ User with Member ID ${banMemberId} not found`);
          return;
        }
        
        banUsers[banUserIndex].banned = true;
        await saveData(USERS_FILE, banUsers);
        
        bot.sendMessage(chatId, `✅ User ${banMemberId} has been banned`);
        
        // Notify user
        try {
          bot.sendMessage(banUsers[banUserIndex].chatId, '🚫 Your account has been banned by administrator.');
        } catch (error) {
          console.log('Could not notify banned user:', error.message);
        }
        break;
        
      case 'unban':
        if (parts.length < 2) {
          bot.sendMessage(chatId, '❌ Usage: /admin unban MEMBER_ID');
          return;
        }
        
        const unbanMemberId = parts[1].toUpperCase();
        const unbanUsers = await loadData(USERS_FILE);
        const unbanUserIndex = unbanUsers.findIndex(u => u.memberId === unbanMemberId && !u.isFake);
        
        if (unbanUserIndex === -1) {
          bot.sendMessage(chatId, `❌ User with Member ID ${unbanMemberId} not found`);
          return;
        }
        
        unbanUsers[unbanUserIndex].banned = false;
        await saveData(USERS_FILE, unbanUsers);
        
        bot.sendMessage(chatId, `✅ User ${unbanMemberId} has been unbanned`);
        
        // Notify user
        try {
          bot.sendMessage(unbanUsers[unbanUserIndex].chatId, '✅ Your account has been unbanned by administrator.');
        } catch (error) {
          console.log('Could not notify unbanned user:', error.message);
        }
        break;
        
      case 'reset':
        if (parts.length < 2) {
          bot.sendMessage(chatId, '❌ Usage: /admin reset MEMBER_ID');
          return;
        }
        
        const resetMemberId = parts[1].toUpperCase();
        const resetUsers = await loadData(USERS_FILE);
        const resetUserIndex = resetUsers.findIndex(u => u.memberId === resetMemberId && !u.isFake);
        
        if (resetUserIndex === -1) {
          bot.sendMessage(chatId, `❌ User with Member ID ${resetMemberId} not found`);
          return;
        }
        
        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        resetUsers[resetUserIndex].passwordHash = hashPassword(tempPassword);
        resetUsers[resetUserIndex].requiresPasswordReset = true;
        
        await saveData(USERS_FILE, resetUsers);
        
        const resetMessage = `✅ Password reset for ${resetMemberId}\n\n` +
                            `Temporary Password: ${tempPassword}\n\n` +
                            `User will be forced to change password on next login.`;
        
        bot.sendMessage(chatId, resetMessage);
        
        // Notify user
        try {
          bot.sendMessage(resetUsers[resetUserIndex].chatId, 
            `🔐 Your password has been reset by administrator.\n\n` +
            `Temporary Password: ${tempPassword}\n\n` +
            `Please login with this password and reset it immediately.`);
        } catch (error) {
          console.log('Could not notify user:', error.message);
        }
        break;
        
      case 'delete':
        if (parts.length < 2) {
          bot.sendMessage(chatId, '❌ Usage: /admin delete MEMBER_ID');
          return;
        }
        
        const deleteMemberId = parts[1].toUpperCase();
        const deleteUsers = await loadData(USERS_FILE);
        const deleteUserIndex = deleteUsers.findIndex(u => u.memberId === deleteMemberId && !u.isFake);
        
        if (deleteUserIndex === -1) {
          bot.sendMessage(chatId, `❌ User with Member ID ${deleteMemberId} not found`);
          return;
        }
        
        const deletedUser = deleteUsers.splice(deleteUserIndex, 1)[0];
        await saveData(USERS_FILE, deleteUsers);
        
        bot.sendMessage(chatId, `✅ User ${deleteMemberId} (${deletedUser.name}) has been deleted`);
        
        // Notify user
        try {
          bot.sendMessage(deletedUser.chatId, '❌ Your account has been deleted by administrator.');
        } catch (error) {
          console.log('Could not notify deleted user:', error.message);
        }
        break;
        
      case 'addfake':
        const count = parts.length > 1 ? parseInt(parts[1]) : 10;
        
        if (isNaN(count) || count < 1 || count > 1000) {
          bot.sendMessage(chatId, '❌ Please specify a number between 1 and 1000');
          return;
        }
        
        const fakeMembersData = await loadData(FAKE_MEMBERS_FILE);
        const newFakeMembers = generateFakeMembers(count);
        fakeMembersData.push(...newFakeMembers);
        
        await saveData(FAKE_MEMBERS_FILE, fakeMembersData);
        
        bot.sendMessage(chatId, `✅ Added ${count} fake members\n` +
                               `Total fake members: ${fakeMembersData.length}`);
        break;
        
      case 'tickets':
        const tickets = await loadData(SUPPORT_TICKETS_FILE);
        const openTickets = tickets.filter(t => t.status === 'open');
        const closedTickets = tickets.filter(t => t.status === 'closed');
        
        let ticketsMessage = `🎫 **Support Tickets**\n\n` +
                            `Open: ${openTickets.length}\n` +
                            `Closed: ${closedTickets.length}\n\n` +
                            `**Recent Open Tickets:**\n`;
        
        const recentTickets = openTickets.slice(-5).reverse();
        recentTickets.forEach(ticket => {
          ticketsMessage += `• ${ticket.id} - ${ticket.name} (${ticket.memberId})\n`;
        });
        
        bot.sendMessage(chatId, ticketsMessage, { parse_mode: 'Markdown' });
        break;
        
      default:
        bot.sendMessage(chatId, '❌ Unknown admin command. Use /admin login first');
    }
  } catch (error) {
    console.log('❌ Admin command error:', error.message);
    bot.sendMessage(chatId, '❌ Error processing admin command');
  }
});

// Handle process cleanup
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
