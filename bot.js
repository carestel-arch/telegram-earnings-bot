const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Data storage files
const USERS_FILE = 'users.json';
const INVESTMENTS_FILE = 'investments.json';
const WITHDRAWALS_FILE = 'withdrawals.json';
const REFERRALS_FILE = 'referrals.json';
const FAKE_MEMBERS_FILE = 'fake_members.json';
const TRANSACTIONS_FILE = 'transactions.json';

// Initialize storage
async function initStorage() {
  const files = [USERS_FILE, INVESTMENTS_FILE, WITHDRAWALS_FILE, REFERRALS_FILE, FAKE_MEMBERS_FILE, TRANSACTIONS_FILE];
  
  for (const file of files) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, JSON.stringify([]));
    }
  }
  
  // Generate fake members if empty
  const fakeMembers = JSON.parse(await fs.readFile(FAKE_MEMBERS_FILE, 'utf8') || '[]');
  if (fakeMembers.length === 0) {
    const initialFakeMembers = generateFakeMembers(50);
    await fs.writeFile(FAKE_MEMBERS_FILE, JSON.stringify(initialFakeMembers, null, 2));
  }
  
  console.log('✅ Storage initialized');
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

// Generate fake members
function generateFakeMembers(count) {
  const fakeMembers = [];
  const names = ['John', 'Emma', 'Michael', 'Sophia', 'James', 'Olivia', 'Robert', 'Ava', 'David', 'Isabella'];
  
  for (let i = 1; i <= count; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const investment = Math.floor(Math.random() * 500) + 50;
    const profit = investment * 0.02 * 7; // 2% daily for 7 days
    const referrals = Math.floor(Math.random() * 5);
    
    fakeMembers.push({
      id: `FAKE-${1000 + i}`,
      name: `${name} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}.`,
      investment: investment,
      profit: profit.toFixed(2),
      referrals: referrals,
      joinDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000).toISOString(),
      isFake: true
    });
  }
  
  return fakeMembers;
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
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

// Calculate total profit after days
function calculateTotalProfit(investmentAmount, days) {
  return investmentAmount * 0.02 * days;
}

// Calculate referral bonus (10% of referred user's investment)
function calculateReferralBonus(investmentAmount) {
  return investmentAmount * 0.10;
}

// Format currency
function formatCurrency(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await initStorage();
  scheduleDailyProfits();
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
    polling: true
  });
  console.log('✅ Bot instance created');
} catch (error) {
  console.log('❌ Bot creation failed:', error.message);
  process.exit(1);
}

// User sessions
const userSessions = {};

// Daily profit scheduler
function scheduleDailyProfits() {
  // Calculate profits for all active investments every 24 hours
  setInterval(async () => {
    try {
      const investments = await loadData(INVESTMENTS_FILE);
      const users = await loadData(USERS_FILE);
      
      const activeInvestments = investments.filter(inv => inv.status === 'active');
      
      for (const investment of activeInvestments) {
        const dailyProfit = calculateDailyProfit(investment.amount);
        
        // Update user balance
        const userIndex = users.findIndex(u => u.memberId === investment.memberId);
        if (userIndex !== -1) {
          users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + dailyProfit;
          users[userIndex].totalEarned = (parseFloat(users[userIndex].totalEarned) || 0) + dailyProfit;
          
          // Record transaction
          const transactions = await loadData(TRANSACTIONS_FILE);
          transactions.push({
            id: `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            memberId: investment.memberId,
            type: 'daily_profit',
            amount: dailyProfit,
            description: `Daily profit from investment #${investment.id}`,
            date: new Date().toISOString()
          });
          await saveData(TRANSACTIONS_FILE, transactions);
          
          // Notify user if they're online (optional)
          try {
            await bot.sendMessage(users[userIndex].chatId, 
              `💰 **Daily Profit Added!**\n\n` +
              `Investment: ${formatCurrency(investment.amount)}\n` +
              `Daily Profit: ${formatCurrency(dailyProfit)}\n` +
              `New Balance: ${formatCurrency(users[userIndex].balance)}\n\n` +
              `Keep referring friends to earn more!`
            );
          } catch (error) {
            // User might not be active, that's okay
          }
        }
        
        // Update investment
        investment.daysActive = (investment.daysActive || 0) + 1;
        investment.totalProfit = (parseFloat(investment.totalProfit) || 0) + dailyProfit;
        
        // Check if investment period completed (30 days)
        if (investment.daysActive >= 30) {
          investment.status = 'completed';
          
          // Notify user
          const user = users.find(u => u.memberId === investment.memberId);
          if (user) {
            try {
              await bot.sendMessage(user.chatId,
                `🎉 **Investment Completed!**\n\n` +
                `Investment #${investment.id} has completed its 30-day period.\n` +
                `Total Profit Earned: ${formatCurrency(investment.totalProfit)}\n\n` +
                `You can now withdraw your profits!`
              );
            } catch (error) {
              console.log('Could not notify user:', error.message);
            }
          }
        }
      }
      
      await saveData(USERS_FILE, users);
      await saveData(INVESTMENTS_FILE, investments);
      
      console.log('✅ Daily profits calculated for', activeInvestments.length, 'investments');
    } catch (error) {
      console.log('❌ Error calculating daily profits:', error.message);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
}

// ==================== BOT COMMANDS ====================

// Start command with referral support
bot.onText(/\/start(?: (.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match ? match[1] : null;
  const username = msg.from.username || msg.from.first_name;
  
  console.log('📱 /start from:', chatId, 'Referral:', referralCode);
  
  // Clear any existing session
  if (userSessions[chatId]) {
    delete userSessions[chatId];
  }
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    if (user.banned) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support for assistance.');
      return;
    }
    
    // Update last login
    user.lastLogin = new Date().toISOString();
    await saveData(USERS_FILE, users);
    
    const welcomeMessage = `👋 Welcome back, ${user.name}!\n\n` +
                          `💰 Balance: ${formatCurrency(user.balance || 0)}\n` +
                          `📈 Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                          `👥 Referrals: ${user.referrals || 0}\n` +
                          `🔗 Your Code: ${user.referralCode}\n\n` +
                          `📋 **Quick Commands:**\n` +
                          `/invest - Make investment\n` +
                          `/earnings - View earnings\n` +
                          `/withdraw - Withdraw funds\n` +
                          `/referral - Share & earn 10%\n` +
                          `/profile - Account details\n` +
                          `/support - Contact support`;
    
    await bot.sendMessage(chatId, welcomeMessage);
  } else {
    // Store referral code if provided
    if (referralCode) {
      userSessions[chatId] = { referralCode: referralCode };
    }
    
    // Show fake members success stories
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    const recentSuccess = fakeMembers.slice(0, 3);
    
    let fakeMessage = '🌟 **Recent Success Stories:**\n\n';
    recentSuccess.forEach(member => {
      fakeMessage += `✅ ${member.name} invested ${formatCurrency(member.investment)} & earned ${formatCurrency(member.profit)}\n`;
    });
    
    fakeMessage += '\n🚀 **Ready to Start Earning?**\n\n';
    fakeMessage += '💵 **Earn 2% Daily Profit**\n';
    fakeMessage += '👥 **Earn 10% from referrals**\n';
    fakeMessage += '⚡ **Fast Withdrawals (10-15 min)**\n\n';
    fakeMessage += 'Choose an option:\n';
    fakeMessage += '/register - Create account\n';
    fakeMessage += '/login - Existing account\n';
    fakeMessage += '/investnow - Quick start guide';
    
    if (referralCode) {
      fakeMessage += '\n\n🎁 **You were invited! Use /register to get bonus**';
    }
    
    await bot.sendMessage(chatId, fakeMessage);
  }
});

// Quick investment guide
bot.onText(/\/investnow/, async (msg) => {
  const chatId = msg.chat.id;
  
  const guideMessage = `🚀 **Quick Start Guide**\n\n` +
                      `1. **Register Account**\n` +
                      `   Use /register to create account\n\n` +
                      `2. **Make Investment**\n` +
                      `   Use /invest to start\n` +
                      `   Minimum: $10\n\n` +
                      `3. **Earn Daily**\n` +
                      `   • 2% daily profit\n` +
                      `   • Auto-added to balance\n\n` +
                      `4. **Earn from Referrals**\n` +
                      `   • Share your referral code\n` +
                      `   • Earn 10% of their investment\n\n` +
                      `5. **Withdraw Anytime**\n` +
                      `   • Minimum: $2\n` +
                      `   • Processing: 10-15 minutes\n\n` +
                      `📞 **Support:** @starlifeadvert\n` +
                      `💳 **Payment:** M-Pesa Till 6034186`;
  
  await bot.sendMessage(chatId, guideMessage);
});

// Register command
bot.onText(/\/register/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const existingUser = users.find(u => u.chatId === chatId.toString());
  
  if (existingUser) {
    await bot.sendMessage(chatId, '✅ You already have an account. Use /login to access.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'awaiting_name',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `📝 **Account Registration**\n\n` +
    `Step 1/3: Enter your full name\n\n` +
    `Example: John Doe\n` +
    `Enter your name:`
  );
});

// Handle registration
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session) return;
  
  try {
    switch (session.step) {
      case 'awaiting_name':
        session.data.name = text.trim();
        session.step = 'awaiting_password';
        
        await bot.sendMessage(chatId,
          `✅ Name saved: ${session.data.name}\n\n` +
          `Step 2/3: Create password\n\n` +
          `Minimum 6 characters\n` +
          `Enter password:`
        );
        break;
        
      case 'awaiting_password':
        if (text.length < 6) {
          await bot.sendMessage(chatId, '❌ Password must be at least 6 characters. Try again:');
          return;
        }
        
        session.data.passwordHash = hashPassword(text);
        session.step = 'awaiting_email';
        
        await bot.sendMessage(chatId,
          `✅ Password set\n\n` +
          `Step 3/3: Enter email\n\n` +
          `For notifications & receipts\n` +
          `Enter email:`
        );
        break;
        
      case 'awaiting_email':
        const email = text.trim().toLowerCase();
        
        // Create new user
        const newUser = {
          chatId: chatId.toString(),
          memberId: `USER-${Date.now().toString().slice(-6)}`,
          name: session.data.name,
          email: email,
          passwordHash: session.data.passwordHash,
          balance: 0,
          totalEarned: 0,
          referrals: 0,
          referralEarnings: 0,
          referralCode: `REF-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          joinedDate: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
          banned: false,
          totalInvested: 0,
          activeInvestments: 0
        };
        
        // Handle referral if exists
        if (session.referralCode) {
          // Find referrer
          const allUsers = await loadData(USERS_FILE);
          const referrer = allUsers.find(u => u.referralCode === session.referralCode);
          
          if (referrer) {
            // Store referrer info
            newUser.referredBy = referrer.memberId;
            newUser.referredByName = referrer.name;
          }
        }
        
        // Save user
        const currentUsers = await loadData(USERS_FILE);
        currentUsers.push(newUser);
        await saveData(USERS_FILE, currentUsers);
        
        // Clear session
        delete userSessions[chatId];
        
        // Send success message
        const successMessage = `🎉 **Registration Successful!**\n\n` +
                              `Welcome ${newUser.name}!\n\n` +
                              `📋 **Your Account:**\n` +
                              `Member ID: ${newUser.memberId}\n` +
                              `Referral Code: ${newUser.referralCode}\n` +
                              `Email: ${newUser.email}\n\n` +
                              `💰 **Start Earning:**\n` +
                              `1. Use /invest to make first investment\n` +
                              `2. Share your code: /referral\n` +
                              `3. Earn 2% daily + 10% from referrals\n\n` +
                              `💳 **Payment Details:**\n` +
                              `M-Pesa Till: 6034186\n` +
                              `Name: Starlife Advert US Agency\n\n` +
                              `📞 **Support:** @starlifeadvert`;
        
        await bot.sendMessage(chatId, successMessage);
        
        // Notify referrer if applicable
        if (newUser.referredBy) {
          const referrer = currentUsers.find(u => u.memberId === newUser.referredBy);
          if (referrer) {
            try {
              await bot.sendMessage(referrer.chatId,
                `🎉 **New Referral!**\n\n` +
                `${newUser.name} joined using your referral code!\n` +
                `When they invest, you'll earn 10% of their investment!\n\n` +
                `Keep sharing your code: ${referrer.referralCode}`
              );
            } catch (error) {
              console.log('Could not notify referrer');
            }
          }
        }
        
        // Notify admin
        const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
        if (adminIds.length > 0) {
          const adminMessage = `👤 **New Registration**\n\n` +
                              `Name: ${newUser.name}\n` +
                              `Member ID: ${newUser.memberId}\n` +
                              `Email: ${newUser.email}\n` +
                              `Time: ${new Date().toLocaleString()}`;
          
          adminIds.forEach(adminId => {
            bot.sendMessage(adminId, adminMessage).catch(console.error);
          });
        }
        break;
    }
  } catch (error) {
    console.log('Registration error:', error.message);
    await bot.sendMessage(chatId, '❌ Registration failed. Please try /register again.');
    delete userSessions[chatId];
  }
});

// Login command
bot.onText(/\/login/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (user) {
    await bot.sendMessage(chatId, '✅ You are already logged in. Use /start to see dashboard.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'login_memberid',
    data: {}
  };
  
  await bot.sendMessage(chatId,
    `🔐 **Login**\n\n` +
    `Enter your Member ID:\n` +
    `(Format: USER-123456)`
  );
});

// Handle login
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session || !session.step.startsWith('login')) return;
  
  try {
    switch (session.step) {
      case 'login_memberid':
        session.data.memberId = text.trim().toUpperCase();
        session.step = 'login_password';
        
        await bot.sendMessage(chatId, 'Enter your password:');
        break;
        
      case 'login_password':
        const memberId = session.data.memberId;
        const passwordHash = hashPassword(text);
        
        const users = await loadData(USERS_FILE);
        const user = users.find(u => 
          u.memberId === memberId && 
          u.passwordHash === passwordHash
        );
        
        if (user) {
          if (user.banned) {
            await bot.sendMessage(chatId, '🚫 Account banned. Contact support.');
            delete userSessions[chatId];
            return;
          }
          
          // Update chat ID and last login
          user.chatId = chatId.toString();
          user.lastLogin = new Date().toISOString();
          await saveData(USERS_FILE, users);
          
          delete userSessions[chatId];
          
          await bot.sendMessage(chatId,
            `✅ **Login Successful!**\n\n` +
            `Welcome back, ${user.name}!\n\n` +
            `Balance: ${formatCurrency(user.balance)}\n` +
            `Total Earned: ${formatCurrency(user.totalEarned)}\n\n` +
            `Use /invest to add funds\n` +
            `Use /earnings to view details`
          );
        } else {
          await bot.sendMessage(chatId, '❌ Invalid Member ID or password. Try /login again.');
          delete userSessions[chatId];
        }
        break;
    }
  } catch (error) {
    console.log('Login error:', error.message);
    await bot.sendMessage(chatId, '❌ Login failed. Try again.');
    delete userSessions[chatId];
  }
});

// Invest command
bot.onText(/\/invest/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login or register with /register');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Account banned. Contact support.');
    return;
  }
  
  userSessions[chatId] = {
    step: 'invest_amount',
    data: { memberId: user.memberId }
  };
  
  await bot.sendMessage(chatId,
    `💰 **Make Investment**\n\n` +
    `Minimum Investment: $10\n` +
    `Daily Profit: 2%\n` +
    `Investment Period: 30 days\n\n` +
    `**Payment Details:**\n` +
    `💳 M-Pesa Till: 6034186\n` +
    `🏢 Name: Starlife Advert US Agency\n\n` +
    `After payment, enter amount invested:`
  );
});

// Handle investment
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  
  const session = userSessions[chatId];
  if (!session || session.step !== 'invest_amount') return;
  
  try {
    const amount = parseFloat(text);
    
    if (isNaN(amount) || amount < 10) {
      await bot.sendMessage(chatId, '❌ Minimum investment is $10. Enter valid amount:');
      return;
    }
    
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, '❌ User not found. Please login again.');
      delete userSessions[chatId];
      return;
    }
    
    // Create investment
    const investment = {
      id: `INV-${Date.now()}`,
      memberId: session.data.memberId,
      userName: users[userIndex].name,
      amount: amount,
      dailyProfit: calculateDailyProfit(amount),
      totalProfit: 0,
      daysActive: 0,
      status: 'active',
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      paymentMethod: 'M-Pesa',
      paymentDetails: 'Till 6034186 - Starlife Advert US Agency'
    };
    
    // Save investment
    const investments = await loadData(INVESTMENTS_FILE);
    investments.push(investment);
    await saveData(INVESTMENTS_FILE, investments);
    
    // Update user stats
    users[userIndex].totalInvested = (parseFloat(users[userIndex].totalInvested) || 0) + amount;
    users[userIndex].activeInvestments = (users[userIndex].activeInvestments || 0) + 1;
    
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-${Date.now()}`,
      memberId: session.data.memberId,
      type: 'investment',
      amount: amount,
      description: `Investment #${investment.id}`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    delete userSessions[chatId];
    
    // Send confirmation
    await bot.sendMessage(chatId,
      `✅ **Investment Created!**\n\n` +
      `Investment ID: ${investment.id}\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `Daily Profit: ${formatCurrency(investment.dailyProfit)}\n` +
      `Estimated Monthly: ${formatCurrency(amount * 0.02 * 30)}\n` +
      `Start Date: ${new Date().toLocaleDateString()}\n` +
      `End Date: ${new Date(investment.endDate).toLocaleDateString()}\n\n` +
      `💰 **Profit Calculation:**\n` +
      `• 2% daily added to balance\n` +
      `• Auto-calculated every 24h\n` +
      `• View with /earnings\n\n` +
      `👥 **Referral Bonus:**\n` +
      `Share your code: ${users[userIndex].referralCode}\n` +
      `Earn 10% when friends invest!`
    );
    
    // Handle referral bonus for referrer
    if (users[userIndex].referredBy) {
      const referrer = users.find(u => u.memberId === users[userIndex].referredBy);
      if (referrer) {
        const referralBonus = calculateReferralBonus(amount);
        
        // Update referrer stats
        const referrerIndex = users.findIndex(u => u.memberId === referrer.memberId);
        if (referrerIndex !== -1) {
          users[referrerIndex].balance = (parseFloat(users[referrerIndex].balance) || 0) + referralBonus;
          users[referrerIndex].referralEarnings = (parseFloat(users[referrerIndex].referralEarnings) || 0) + referralBonus;
          users[referrerIndex].referrals = (users[referrerIndex].referrals || 0) + 1;
          
          // Save referral record
          const referrals = await loadData(REFERRALS_FILE);
          referrals.push({
            id: `REF-${Date.now()}`,
            referrerId: referrer.memberId,
            referrerName: referrer.name,
            referredId: users[userIndex].memberId,
            referredName: users[userIndex].name,
            investmentAmount: amount,
            bonusAmount: referralBonus,
            date: new Date().toISOString()
          });
          await saveData(REFERRALS_FILE, referrals);
          
          // Record transaction for referrer
          transactions.push({
            id: `TRX-REF-${Date.now()}`,
            memberId: referrer.memberId,
            type: 'referral_bonus',
            amount: referralBonus,
            description: `10% referral bonus from ${users[userIndex].name}'s investment`,
            date: new Date().toISOString()
          });
          await saveData(TRANSACTIONS_FILE, transactions);
          
          await saveData(USERS_FILE, users);
          
          // Notify referrer
          try {
            await bot.sendMessage(referrer.chatId,
              `💰 **Referral Bonus Earned!**\n\n` +
              `${users[userIndex].name} invested ${formatCurrency(amount)}\n` +
              `You earned 10%: ${formatCurrency(referralBonus)}\n\n` +
              `New Balance: ${formatCurrency(users[referrerIndex].balance)}\n` +
              `Total Referral Earnings: ${formatCurrency(users[referrerIndex].referralEarnings)}\n\n` +
              `Keep sharing your code!`
            );
          } catch (error) {
            console.log('Could not notify referrer');
          }
        }
      }
    }
    
    // Notify admin
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0) {
      const adminMessage = `💰 **New Investment**\n\n` +
                          `User: ${users[userIndex].name}\n` +
                          `Member ID: ${users[userIndex].memberId}\n` +
                          `Amount: ${formatCurrency(amount)}\n` +
                          `Investment ID: ${investment.id}\n` +
                          `Time: ${new Date().toLocaleString()}`;
      
      adminIds.forEach(adminId => {
        bot.sendMessage(adminId, adminMessage).catch(console.error);
      });
    }
  } catch (error) {
    console.log('Investment error:', error.message);
    await bot.sendMessage(chatId, '❌ Error creating investment. Try /invest again.');
    delete userSessions[chatId];
  }
});

// Earnings command
bot.onText(/\/earnings/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Account banned. Contact support.');
    return;
  }
  
  const investments = await loadData(INVESTMENTS_FILE);
  const userInvestments = investments.filter(inv => inv.memberId === user.memberId);
  const activeInvestments = userInvestments.filter(inv => inv.status === 'active');
  
  let earningsMessage = `💰 **Your Earnings Dashboard**\n\n`;
  
  earningsMessage += `👤 **Account Summary**\n`;
  earningsMessage += `Name: ${user.name}\n`;
  earningsMessage += `Member ID: ${user.memberId}\n`;
  earningsMessage += `Balance: ${formatCurrency(user.balance)}\n`;
  earningsMessage += `Total Earned: ${formatCurrency(user.totalEarned)}\n`;
  earningsMessage += `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n`;
  earningsMessage += `Total Referrals: ${user.referrals || 0}\n\n`;
  
  earningsMessage += `📈 **Investment Summary**\n`;
  earningsMessage += `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
  earningsMessage += `Active Investments: ${activeInvestments.length}\n\n`;
  
  if (activeInvestments.length > 0) {
    earningsMessage += `🏦 **Active Investments**\n`;
    activeInvestments.forEach((inv, index) => {
      const remainingDays = Math.max(0, 30 - (inv.daysActive || 0));
      earningsMessage += `${index + 1}. ${formatCurrency(inv.amount)} - ${remainingDays}d left\n`;
    });
    earningsMessage += `\n`;
  }
  
  earningsMessage += `💵 **Withdrawal Info**\n`;
  earningsMessage += `Minimum: $2\n`;
  earningsMessage += `Processing: 10-15 minutes\n`;
  earningsMessage += `Available: ${formatCurrency(user.balance)}\n\n`;
  
  earningsMessage += `👥 **Referral Program**\n`;
  earningsMessage += `Your Code: ${user.referralCode}\n`;
  earningsMessage += `Earn 10% of friends' investments!\n\n`;
  
  earningsMessage += `📱 **Quick Actions**\n`;
  earningsMessage += `/withdraw - Withdraw funds\n`;
  earningsMessage += `/invest - Add more funds\n`;
  earningsMessage += `/referral - Share & earn\n`;
  earningsMessage += `/support - Contact help`;
  
  await bot.sendMessage(chatId, earningsMessage);
});

// Withdraw command
bot.onText(/\/withdraw/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  if (user.banned) {
    await bot.sendMessage(chatId, '🚫 Account banned. Contact support.');
    return;
  }
  
  const balance = parseFloat(user.balance) || 0;
  
  if (balance < 2) {
    await bot.sendMessage(chatId,
      `❌ Minimum withdrawal is $2\n\n` +
      `Your Balance: ${formatCurrency(balance)}\n` +
      `Need ${formatCurrency(2 - balance)} more\n\n` +
      `Invest or refer friends to earn more!`
    );
    return;
  }
  
  userSessions[chatId] = {
    step: 'withdraw_amount',
    data: { memberId: user.memberId, maxAmount: balance }
  };
  
  await bot.sendMessage(chatId,
    `💳 **Withdrawal Request**\n\n` +
    `Available Balance: ${formatCurrency(balance)}\n` +
    `Minimum Withdrawal: $2\n` +
    `Processing Time: 10-15 minutes\n\n` +
    `**Payment Methods:**\n` +
    `• M-Pesa (Kenya)\n` +
    `• Bank Transfer\n` +
    `• PayPal (if available)\n\n` +
    `Enter amount to withdraw:`
  );
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
    const maxAmount = session.data.maxAmount;
    
    if (isNaN(amount) || amount < 2 || amount > maxAmount) {
      await bot.sendMessage(chatId,
        `❌ Invalid amount\n\n` +
        `Minimum: $2\n` +
        `Maximum: ${formatCurrency(maxAmount)}\n\n` +
        `Enter valid amount:`
      );
      return;
    }
    
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === session.data.memberId);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, '❌ User not found.');
      delete userSessions[chatId];
      return;
    }
    
    // Update balance
    users[userIndex].balance = maxAmount - amount;
    
    // Create withdrawal request
    const withdrawal = {
      id: `WD-${Date.now()}`,
      memberId: session.data.memberId,
      userName: users[userIndex].name,
      amount: amount,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      completedAt: null,
      paymentMethod: 'To be confirmed',
      adminNote: ''
    };
    
    // Save withdrawal
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    withdrawals.push(withdrawal);
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-WD-${Date.now()}`,
      memberId: session.data.memberId,
      type: 'withdrawal',
      amount: -amount,
      description: `Withdrawal request #${withdrawal.id}`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await saveData(USERS_FILE, users);
    
    delete userSessions[chatId];
    
    // Send confirmation
    await bot.sendMessage(chatId,
      `✅ **Withdrawal Request Submitted!**\n\n` +
      `Withdrawal ID: ${withdrawal.id}\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `Status: Pending\n` +
      `Processing: 10-15 minutes\n\n` +
      `📞 **Next Steps:**\n` +
      `1. Contact @starlifeadvert\n` +
      `2. Provide Withdrawal ID\n` +
      `3. Confirm payment details\n\n` +
      `Your balance: ${formatCurrency(users[userIndex].balance)}`
    );
    
    // Notify admin
    const adminIds = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [];
    if (adminIds.length > 0) {
      const adminMessage = `💳 **New Withdrawal Request**\n\n` +
                          `User: ${withdrawal.userName}\n` +
                          `Member ID: ${withdrawal.memberId}\n` +
                          `Amount: ${formatCurrency(amount)}\n` +
                          `Withdrawal ID: ${withdrawal.id}\n` +
                          `Balance After: ${formatCurrency(users[userIndex].balance)}\n\n` +
                          `Approve: /approve ${withdrawal.id}\n` +
                          `Reject: /reject ${withdrawal.id}`;
      
      adminIds.forEach(adminId => {
        bot.sendMessage(adminId, adminMessage).catch(console.error);
      });
    }
  } catch (error) {
    console.log('Withdrawal error:', error.message);
    await bot.sendMessage(chatId, '❌ Error processing withdrawal. Try /withdraw again.');
    delete userSessions[chatId];
  }
});

// Referral command
bot.onText(/\/referral/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const referrals = await loadData(REFERRALS_FILE);
  const userReferrals = referrals.filter(ref => ref.referrerId === user.memberId);
  const totalReferralEarnings = userReferrals.reduce((sum, ref) => sum + ref.bonusAmount, 0);
  
  const botUsername = (await bot.getMe()).username;
  const referralLink = `https://t.me/${botUsername}?start=${user.referralCode}`;
  
  const referralMessage = `👥 **Earn 10% Referral Commission**\n\n` +
                         `**Your Referral Stats:**\n` +
                         `Total Referrals: ${userReferrals.length}\n` +
                         `Total Earned: ${formatCurrency(totalReferralEarnings)}\n` +
                         `Pending Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                         `**Your Referral Code:**\n` +
                         `\`${user.referralCode}\`\n\n` +
                         `**Your Referral Link:**\n` +
                         `${referralLink}\n\n` +
                         `**How It Works:**\n` +
                         `1. Share your link/code with friends\n` +
                         `2. They register using your link\n` +
                         `3. When they invest ANY amount\n` +
                         `4. You earn 10% of their investment!\n\n` +
                         `**Example:**\n` +
                         `• Friend invests $100 → You earn $10\n` +
                         `• Friend invests $500 → You earn $50\n` +
                         `• Friend invests $1000 → You earn $100\n\n` +
                         `**Payment Methods to Share:**\n` +
                         `💳 M-Pesa Till: 6034186\n` +
                         `🏢 Name: Starlife Advert US Agency\n\n` +
                         `**Copy & Share Message:**\n` +
                         `\`\`\`\n` +
                         `🎯 Join Starlife Advert & Earn 2% Daily!\n\n` +
                         `💰 Invest from $10\n` +
                         `📈 Earn 2% daily profit\n` +
                         `👥 Get 10% from referrals\n` +
                         `⚡ Fast withdrawals (10-15 min)\n\n` +
                         `Use my referral code: ${user.referralCode}\n` +
                         `or click: ${referralLink}\n\n` +
                         `Payment: M-Pesa Till 6034186\n` +
                         `Name: Starlife Advert US Agency\n` +
                         `\`\`\``;
  
  await bot.sendMessage(chatId, referralMessage, { parse_mode: 'Markdown' });
});

// Profile command
bot.onText(/\/profile/, async (msg) => {
  const chatId = msg.chat.id;
  
  const users = await loadData(USERS_FILE);
  const user = users.find(u => u.chatId === chatId.toString());
  
  if (!user) {
    await bot.sendMessage(chatId, '❌ Please login first with /login');
    return;
  }
  
  const profileMessage = `👤 **Your Profile**\n\n` +
                        `**Account Details:**\n` +
                        `Name: ${user.name}\n` +
                        `Member ID: ${user.memberId}\n` +
                        `Email: ${user.email}\n` +
                        `Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n` +
                        `Last Login: ${new Date(user.lastLogin).toLocaleDateString()}\n\n` +
                        `**Financial Summary:**\n` +
                        `Current Balance: ${formatCurrency(user.balance)}\n` +
                        `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n` +
                        `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n` +
                        `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n` +
                        `**Investment Stats:**\n` +
                        `Active Investments: ${user.activeInvestments || 0}\n` +
                        `Total Referrals: ${user.referrals || 0}\n` +
                        `Referral Code: ${user.referralCode}\n\n` +
                        `**Account Status:** ${user.banned ? '🚫 BANNED' : '✅ ACTIVE'}\n\n` +
                        `**To update profile, contact support:**\n` +
                        `@starlifeadvert`;
  
  await bot.sendMessage(chatId, profileMessage);
});

// Support command
bot.onText(/\/support/, async (msg) => {
  const chatId = msg.chat.id;
  
  const supportMessage = `🆘 **Support Center**\n\n` +
                        `**For Assistance Contact:**\n` +
                        `👤 @starlifeadvert\n\n` +
                        `**Common Issues:**\n` +
                        `• Investment not showing\n` +
                        `• Withdrawal delay\n` +
                        `• Account issues\n` +
                        `• Payment confirmation\n\n` +
                        `**When contacting support:**\n` +
                        `1. Provide your Member ID\n` +
                        `2. Describe your issue clearly\n` +
                        `3. Include relevant transaction IDs\n\n` +
                        `**Response Time:**\n` +
                        `• Usually within 1-2 hours\n` +
                        `• 24/7 support available\n\n` +
                        `**Payment Details (For Reference):**\n` +
                        `💳 M-Pesa Till: 6034186\n` +
                        `🏢 Name: Starlife Advert US Agency\n\n` +
                        `**Quick Help:**\n` +
                        `/investnow - How to invest\n` +
                        `/earnings - Check balance\n` +
                        `/withdraw - Withdraw funds`;
  
  await bot.sendMessage(chatId, supportMessage);
});

// ==================== ADMIN COMMANDS ====================

// Simple admin check middleware
async function checkAdmin(chatId, commandName) {
  if (!isAdmin(chatId)) {
    await bot.sendMessage(chatId,
      `❌ **Admin Access Required**\n\n` +
      `You need admin privileges to use /${commandName}\n\n` +
      `**How to become admin:**\n` +
      `1. Your Chat ID must be in ADMIN_IDS\n` +
      `2. Contact system administrator\n` +
      `3. Current ADMIN_IDS: ${process.env.ADMIN_IDS || 'Not set'}\n\n` +
      `Your Chat ID: ${chatId}`
    );
    return false;
  }
  return true;
}

// Admin panel
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!await checkAdmin(chatId, 'admin')) return;
  
  const adminMessage = `⚡ **Admin Panel**\n\n` +
                      `**User Management:**\n` +
                      `/users - List all users\n` +
                      `/view MEMBER_ID - User details\n` +
                      `/ban MEMBER_ID - Ban user\n` +
                      `/unban MEMBER_ID - Unban user\n` +
                      `/reset MEMBER_ID - Reset password\n` +
                      `/delete MEMBER_ID - Delete user\n\n` +
                      `**Financial Management:**\n` +
                      `/investments - All investments\n` +
                      `/withdrawals - Pending withdrawals\n` +
                      `/approve WD_ID - Approve withdrawal\n` +
                      `/reject WD_ID - Reject withdrawal\n` +
                      `/addfunds MEMBER_ID AMOUNT - Add funds\n\n` +
                      `**System Management:**\n` +
                      `/stats - System statistics\n` +
                      `/addfake COUNT - Add fake members\n` +
                      `/broadcast MESSAGE - Send to all\n\n` +
                      `**Bot Info:**\n` +
                      `/status - Bot status\n` +
                      `/export - Export data`;
  
  await bot.sendMessage(chatId, adminMessage);
});

// Admin: List users
bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!await checkAdmin(chatId, 'users')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake);
    
    if (realUsers.length === 0) {
      await bot.sendMessage(chatId, '📭 No registered users yet.');
      return;
    }
    
    let message = `👥 **Total Users: ${realUsers.length}**\n\n`;
    
    // Show last 10 users
    const lastUsers = realUsers.slice(-10).reverse();
    lastUsers.forEach((user, index) => {
      message += `${index + 1}. ${user.name}\n`;
      message += `   ID: ${user.memberId}\n`;
      message += `   Balance: ${formatCurrency(user.balance)}\n`;
      message += `   Joined: ${new Date(user.joinedDate).toLocaleDateString()}\n`;
      message += `   Status: ${user.banned ? '🚫' : '✅'}\n`;
      message += `   Actions: /view ${user.memberId}\n\n`;
    });
    
    if (realUsers.length > 10) {
      message += `... and ${realUsers.length - 10} more users\n`;
    }
    
    message += `\n**Quick Stats:**\n`;
    message += `Active: ${realUsers.filter(u => !u.banned).length}\n`;
    message += `Banned: ${realUsers.filter(u => u.banned).length}\n`;
    message += `Total Balance: ${formatCurrency(realUsers.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0))}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin users error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching users');
  }
});

// Admin: View user details
bot.onText(/\/view (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!await checkAdmin(chatId, 'view')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === memberId && !u.isFake);
    
    if (!user) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const investments = await loadData(INVESTMENTS_FILE);
    const userInvestments = investments.filter(inv => inv.memberId === memberId);
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const userWithdrawals = withdrawals.filter(wd => wd.memberId === memberId);
    const referrals = await loadData(REFERRALS_FILE);
    const userReferrals = referrals.filter(ref => ref.referrerId === memberId);
    
    let message = `👤 **User Details**\n\n`;
    
    message += `**Basic Info**\n`;
    message += `Name: ${user.name}\n`;
    message += `Member ID: ${user.memberId}\n`;
    message += `Chat ID: ${user.chatId}\n`;
    message += `Email: ${user.email}\n`;
    message += `Joined: ${new Date(user.joinedDate).toLocaleString()}\n`;
    message += `Last Login: ${new Date(user.lastLogin).toLocaleString()}\n`;
    message += `Status: ${user.banned ? '🚫 BANNED' : '✅ ACTIVE'}\n\n`;
    
    message += `**Financial**\n`;
    message += `Balance: ${formatCurrency(user.balance)}\n`;
    message += `Total Invested: ${formatCurrency(user.totalInvested || 0)}\n`;
    message += `Total Earned: ${formatCurrency(user.totalEarned || 0)}\n`;
    message += `Referral Earnings: ${formatCurrency(user.referralEarnings || 0)}\n\n`;
    
    message += `**Investments**\n`;
    message += `Active: ${userInvestments.filter(i => i.status === 'active').length}\n`;
    message += `Total: ${userInvestments.length}\n`;
    message += `Total Amount: ${formatCurrency(userInvestments.reduce((sum, i) => sum + i.amount, 0))}\n\n`;
    
    message += `**Referrals**\n`;
    message += `Total Referred: ${userReferrals.length}\n`;
    message += `Referral Income: ${formatCurrency(userReferrals.reduce((sum, r) => sum + r.bonusAmount, 0))}\n`;
    message += `Referral Code: ${user.referralCode}\n\n`;
    
    message += `**Withdrawals**\n`;
    message += `Pending: ${userWithdrawals.filter(w => w.status === 'pending').length}\n`;
    message += `Completed: ${userWithdrawals.filter(w => w.status === 'completed').length}\n`;
    message += `Total Withdrawn: ${formatCurrency(userWithdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0))}\n\n`;
    
    message += `**Admin Actions**\n`;
    message += `/ban ${memberId} - Ban user\n`;
    message += `/unban ${memberId} - Unban user\n`;
    message += `/reset ${memberId} - Reset password\n`;
    message += `/delete ${memberId} - Delete user\n`;
    message += `/addfunds ${memberId} AMOUNT - Add funds\n`;
    message += `/message ${memberId} - Send message`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin view error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching user details');
  }
});

// Admin: Ban user
bot.onText(/\/ban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!await checkAdmin(chatId, 'ban')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].banned = true;
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId, `✅ User ${memberId} has been banned`);
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        '🚫 **Account Banned**\n\n' +
        'Your account has been banned by administrator.\n' +
        'Contact @starlifeadvert for assistance.'
      );
    } catch (error) {
      console.log('Could not notify banned user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error banning user');
  }
});

// Admin: Unban user
bot.onText(/\/unban (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!await checkAdmin(chatId, 'unban')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].banned = false;
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId, `✅ User ${memberId} has been unbanned`);
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        '✅ **Account Unbanned**\n\n' +
        'Your account has been unbanned by administrator.\n' +
        'You can now access your account normally.'
      );
    } catch (error) {
      console.log('Could not notify unbanned user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error unbanning user');
  }
});

// Admin: Reset password
bot.onText(/\/reset (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!await checkAdmin(chatId, 'reset')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const tempPassword = Math.random().toString(36).slice(-8);
    users[userIndex].passwordHash = hashPassword(tempPassword);
    
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId,
      `✅ Password reset for ${memberId}\n\n` +
      `Temporary Password: ${tempPassword}\n\n` +
      `User must login with this password immediately.`
    );
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        '🔐 **Password Reset**\n\n' +
        'Your password has been reset by administrator.\n\n' +
        `Temporary Password: ${tempPassword}\n\n` +
        '⚠️ Please login immediately and change your password.'
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error resetting password');
  }
});

// Admin: Delete user
bot.onText(/\/delete (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const memberId = match[1].toUpperCase();
  
  if (!await checkAdmin(chatId, 'delete')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    const deletedUser = users.splice(userIndex, 1)[0];
    await saveData(USERS_FILE, users);
    
    await bot.sendMessage(chatId, `✅ User ${memberId} (${deletedUser.name}) deleted`);
    
    // Notify user
    try {
      await bot.sendMessage(deletedUser.chatId,
        '❌ **Account Deleted**\n\n' +
        'Your account has been deleted by administrator.\n' +
        'All your data has been removed from the system.'
      );
    } catch (error) {
      console.log('Could not notify deleted user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error deleting user');
  }
});

// Admin: View investments
bot.onText(/\/investments/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!await checkAdmin(chatId, 'investments')) return;
  
  try {
    const investments = await loadData(INVESTMENTS_FILE);
    
    if (investments.length === 0) {
      await bot.sendMessage(chatId, '📭 No investments yet.');
      return;
    }
    
    const activeInvestments = investments.filter(i => i.status === 'active');
    const completedInvestments = investments.filter(i => i.status === 'completed');
    
    let message = `📈 **Investment Report**\n\n`;
    
    message += `**Summary:**\n`;
    message += `Total Investments: ${investments.length}\n`;
    message += `Active: ${activeInvestments.length}\n`;
    message += `Completed: ${completedInvestments.length}\n`;
    message += `Total Amount: ${formatCurrency(investments.reduce((sum, i) => sum + i.amount, 0))}\n\n`;
    
    message += `**Recent Active Investments (Last 5):**\n`;
    const recentActive = activeInvestments.slice(-5).reverse();
    recentActive.forEach((inv, index) => {
      message += `${index + 1}. ${inv.userName} (${inv.memberId})\n`;
      message += `   Amount: ${formatCurrency(inv.amount)}\n`;
      message += `   Days Active: ${inv.daysActive || 0}\n`;
      message += `   Total Profit: ${formatCurrency(inv.totalProfit || 0)}\n\n`;
    });
    
    message += `**Total Daily Payout:** ${formatCurrency(activeInvestments.reduce((sum, i) => sum + (i.dailyProfit || 0), 0))}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin investments error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching investments');
  }
});

// Admin: View withdrawals
bot.onText(/\/withdrawals/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!await checkAdmin(chatId, 'withdrawals')) return;
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending');
    
    if (pendingWithdrawals.length === 0) {
      await bot.sendMessage(chatId, '✅ No pending withdrawals.');
      return;
    }
    
    let message = `💳 **Pending Withdrawals (${pendingWithdrawals.length})**\n\n`;
    
    pendingWithdrawals.forEach((wd, index) => {
      const timeAgo = Math.floor((new Date() - new Date(wd.requestedAt)) / (1000 * 60));
      message += `${index + 1}. ${wd.userName} (${wd.memberId})\n`;
      message += `   Amount: ${formatCurrency(wd.amount)}\n`;
      message += `   ID: ${wd.id}\n`;
      message += `   Requested: ${timeAgo} minutes ago\n`;
      message += `   Approve: /approve ${wd.id}\n`;
      message += `   Reject: /reject ${wd.id}\n\n`;
    });
    
    message += `**Total Pending:** ${formatCurrency(pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0))}`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin withdrawals error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching withdrawals');
  }
});

// Admin: Approve withdrawal
bot.onText(/\/approve (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!await checkAdmin(chatId, 'approve')) return;
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(w => w.id === withdrawalId);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found`);
      return;
    }
    
    withdrawals[withdrawalIndex].status = 'completed';
    withdrawals[withdrawalIndex].completedAt = new Date().toISOString();
    withdrawals[withdrawalIndex].adminNote = `Approved by admin ${chatId} at ${new Date().toLocaleString()}`;
    
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    // Notify user
    const users = await loadData(USERS_FILE);
    const user = users.find(u => u.memberId === withdrawals[withdrawalIndex].memberId);
    
    if (user) {
      try {
        await bot.sendMessage(user.chatId,
          `✅ **Withdrawal Approved!**\n\n` +
          `Withdrawal ID: ${withdrawalId}\n` +
          `Amount: ${formatCurrency(withdrawals[withdrawalIndex].amount)}\n` +
          `Status: Completed\n\n` +
          `💸 Funds should arrive within 10-15 minutes.\n` +
          `📞 Contact @starlifeadvert if you don't receive.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ Withdrawal ${withdrawalId} approved\n\n` +
      `Amount: ${formatCurrency(withdrawals[withdrawalIndex].amount)}\n` +
      `User: ${withdrawals[withdrawalIndex].userName}\n` +
      `Member ID: ${withdrawals[withdrawalIndex].memberId}`
    );
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error approving withdrawal');
  }
});

// Admin: Reject withdrawal
bot.onText(/\/reject (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const withdrawalId = match[1];
  
  if (!await checkAdmin(chatId, 'reject')) return;
  
  try {
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const withdrawalIndex = withdrawals.findIndex(w => w.id === withdrawalId);
    
    if (withdrawalIndex === -1) {
      await bot.sendMessage(chatId, `❌ Withdrawal ${withdrawalId} not found`);
      return;
    }
    
    // Return funds to user balance
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === withdrawals[withdrawalIndex].memberId);
    
    if (userIndex !== -1) {
      users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + withdrawals[withdrawalIndex].amount;
      await saveData(USERS_FILE, users);
    }
    
    withdrawals[withdrawalIndex].status = 'rejected';
    withdrawals[withdrawalIndex].completedAt = new Date().toISOString();
    withdrawals[withdrawalIndex].adminNote = `Rejected by admin ${chatId} at ${new Date().toLocaleString()}`;
    
    await saveData(WITHDRAWALS_FILE, withdrawals);
    
    // Notify user
    const user = users[userIndex];
    if (user) {
      try {
        await bot.sendMessage(user.chatId,
          `❌ **Withdrawal Rejected**\n\n` +
          `Withdrawal ID: ${withdrawalId}\n` +
          `Amount: ${formatCurrency(withdrawals[withdrawalIndex].amount)}\n` +
          `Status: Rejected\n\n` +
          `💰 Funds returned to your balance.\n` +
          `New Balance: ${formatCurrency(user.balance)}\n\n` +
          `📞 Contact @starlifeadvert for more information.`
        );
      } catch (error) {
        console.log('Could not notify user');
      }
    }
    
    await bot.sendMessage(chatId,
      `❌ Withdrawal ${withdrawalId} rejected\n\n` +
      `Amount returned to user balance\n` +
      `User: ${withdrawals[withdrawalIndex].userName}\n` +
      `Member ID: ${withdrawals[withdrawalIndex].memberId}`
    );
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error rejecting withdrawal');
  }
});

// Admin: Add funds
bot.onText(/\/addfunds (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const params = match[1].split(' ');
  const memberId = params[0].toUpperCase();
  const amount = parseFloat(params[1]);
  
  if (!await checkAdmin(chatId, 'addfunds')) return;
  
  if (!memberId || isNaN(amount) || amount <= 0) {
    await bot.sendMessage(chatId, '❌ Usage: /addfunds MEMBER_ID AMOUNT');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const userIndex = users.findIndex(u => u.memberId === memberId && !u.isFake);
    
    if (userIndex === -1) {
      await bot.sendMessage(chatId, `❌ User ${memberId} not found`);
      return;
    }
    
    users[userIndex].balance = (parseFloat(users[userIndex].balance) || 0) + amount;
    users[userIndex].totalEarned = (parseFloat(users[userIndex].totalEarned) || 0) + amount;
    
    await saveData(USERS_FILE, users);
    
    // Record transaction
    const transactions = await loadData(TRANSACTIONS_FILE);
    transactions.push({
      id: `TRX-ADMIN-${Date.now()}`,
      memberId: memberId,
      type: 'admin_deposit',
      amount: amount,
      description: `Admin deposit by ${chatId}`,
      date: new Date().toISOString()
    });
    await saveData(TRANSACTIONS_FILE, transactions);
    
    await bot.sendMessage(chatId,
      `✅ Funds added to ${memberId}\n\n` +
      `Amount: ${formatCurrency(amount)}\n` +
      `New Balance: ${formatCurrency(users[userIndex].balance)}\n` +
      `User: ${users[userIndex].name}`
    );
    
    // Notify user
    try {
      await bot.sendMessage(users[userIndex].chatId,
        `💰 **Funds Added by Admin**\n\n` +
        `Amount: ${formatCurrency(amount)}\n` +
        `New Balance: ${formatCurrency(users[userIndex].balance)}\n\n` +
        `Thank you for being part of Starlife Advert!`
      );
    } catch (error) {
      console.log('Could not notify user');
    }
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error adding funds');
  }
});

// Admin: Stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!await checkAdmin(chatId, 'stats')) return;
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake);
    const investments = await loadData(INVESTMENTS_FILE);
    const withdrawals = await loadData(WITHDRAWALS_FILE);
    const referrals = await loadData(REFERRALS_FILE);
    
    const totalBalance = realUsers.reduce((sum, u) => sum + (parseFloat(u.balance) || 0), 0);
    const totalInvested = investments.reduce((sum, i) => sum + i.amount, 0);
    const totalWithdrawn = withdrawals.filter(w => w.status === 'completed').reduce((sum, w) => sum + w.amount, 0);
    const totalReferralBonuses = referrals.reduce((sum, r) => sum + r.bonusAmount, 0);
    
    const today = new Date().toISOString().split('T')[0];
    const todayRegistrations = realUsers.filter(u => u.joinedDate.split('T')[0] === today).length;
    const todayInvestments = investments.filter(i => i.startDate.split('T')[0] === today);
    const todayInvestmentAmount = todayInvestments.reduce((sum, i) => sum + i.amount, 0);
    
    let message = `📊 **System Statistics**\n\n`;
    
    message += `**Users**\n`;
    message += `Total Users: ${realUsers.length}\n`;
    message += `Active: ${realUsers.filter(u => !u.banned).length}\n`;
    message += `Banned: ${realUsers.filter(u => u.banned).length}\n`;
    message += `New Today: ${todayRegistrations}\n\n`;
    
    message += `**Financial**\n`;
    message += `Total Balance: ${formatCurrency(totalBalance)}\n`;
    message += `Total Invested: ${formatCurrency(totalInvested)}\n`;
    message += `Total Withdrawn: ${formatCurrency(totalWithdrawn)}\n`;
    message += `Total Referral Bonuses: ${formatCurrency(totalReferralBonuses)}\n`;
    message += `Investments Today: ${formatCurrency(todayInvestmentAmount)} (${todayInvestments.length})\n\n`;
    
    message += `**Investments**\n`;
    message += `Active: ${investments.filter(i => i.status === 'active').length}\n`;
    message += `Completed: ${investments.filter(i => i.status === 'completed').length}\n`;
    message += `Daily Payout: ${formatCurrency(investments.filter(i => i.status === 'active').reduce((sum, i) => sum + (i.dailyProfit || 0), 0))}\n\n`;
    
    message += `**Withdrawals**\n`;
    message += `Pending: ${withdrawals.filter(w => w.status === 'pending').length}\n`;
    message += `Completed: ${withdrawals.filter(w => w.status === 'completed').length}\n`;
    message += `Rejected: ${withdrawals.filter(w => w.status === 'rejected').length}\n\n`;
    
    message += `**System**\n`;
    message += `Uptime: ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n`;
    message += `Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`;
    
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.log('Admin stats error:', error.message);
    await bot.sendMessage(chatId, '❌ Error fetching statistics');
  }
});

// Admin: Add fake members
bot.onText(/\/addfake (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const count = parseInt(match[1]);
  
  if (!await checkAdmin(chatId, 'addfake')) return;
  
  if (isNaN(count) || count < 1 || count > 100) {
    await bot.sendMessage(chatId, '❌ Please specify number between 1-100');
    return;
  }
  
  try {
    const fakeMembers = await loadData(FAKE_MEMBERS_FILE);
    const newFakeMembers = generateFakeMembers(count);
    fakeMembers.push(...newFakeMembers);
    
    await saveData(FAKE_MEMBERS_FILE, fakeMembers);
    
    await bot.sendMessage(chatId,
      `✅ Added ${count} fake members\n` +
      `Total fake members: ${fakeMembers.length}`
    );
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error adding fake members');
  }
});

// Admin: Broadcast message
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const message = match[1];
  
  if (!await checkAdmin(chatId, 'broadcast')) return;
  
  if (!message || message.length < 5) {
    await bot.sendMessage(chatId, '❌ Message too short. Minimum 5 characters.');
    return;
  }
  
  try {
    const users = await loadData(USERS_FILE);
    const realUsers = users.filter(u => !u.isFake && !u.banned);
    
    await bot.sendMessage(chatId, `📢 Broadcasting to ${realUsers.length} users...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of realUsers) {
      try {
        await bot.sendMessage(user.chatId,
          `📢 **Announcement from Starlife Advert**\n\n` +
          `${message}\n\n` +
          `---\n` +
          `This is an official broadcast message.`
        );
        successCount++;
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failCount++;
      }
    }
    
    await bot.sendMessage(chatId,
      `✅ Broadcast Complete\n\n` +
      `Success: ${successCount} users\n` +
      `Failed: ${failCount} users\n` +
      `Total: ${realUsers.length} users`
    );
  } catch (error) {
    console.log('Broadcast error:', error.message);
    await bot.sendMessage(chatId, '❌ Error broadcasting message');
  }
});

// Admin: Bot status
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!await checkAdmin(chatId, 'status')) return;
  
  const statusMessage = `🤖 **Bot Status**\n\n` +
                       `**Connection:** ✅ Online\n` +
                       `**Uptime:** ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\n` +
                       `**Memory Usage:** ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
                       `**Admin IDs:** ${process.env.ADMIN_IDS || 'Not set'}\n` +
                       `**Port:** ${PORT}\n\n` +
                       `**Last Activity:** ${new Date().toLocaleString()}\n` +
                       `**Node Version:** ${process.version}\n` +
                       `**Platform:** ${process.platform}`;
  
  await bot.sendMessage(chatId, statusMessage);
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
      !text.startsWith('/invest') &&
      !text.startsWith('/investnow') &&
      !text.startsWith('/earnings') &&
      !text.startsWith('/withdraw') &&
      !text.startsWith('/referral') &&
      !text.startsWith('/profile') &&
      !text.startsWith('/support') &&
      !text.startsWith('/admin') &&
      !text.startsWith('/users') &&
      !text.startsWith('/view') &&
      !text.startsWith('/ban') &&
      !text.startsWith('/unban') &&
      !text.startsWith('/reset') &&
      !text.startsWith('/delete') &&
      !text.startsWith('/investments') &&
      !text.startsWith('/withdrawals') &&
      !text.startsWith('/approve') &&
      !text.startsWith('/reject') &&
      !text.startsWith('/addfunds') &&
      !text.startsWith('/stats') &&
      !text.startsWith('/addfake') &&
      !text.startsWith('/broadcast') &&
      !text.startsWith('/status')) {
    
    bot.sendMessage(chatId,
      `❓ Unknown command\n\n` +
      `**Available Commands:**\n` +
      `/start - Begin\n` +
      `/investnow - Quick guide\n` +
      `/register - Create account\n` +
      `/login - Access account\n` +
      `/invest - Make investment\n` +
      `/earnings - View earnings\n` +
      `/withdraw - Withdraw funds\n` +
      `/referral - Earn 10%\n` +
      `/profile - Account details\n` +
      `/support - Get help\n\n` +
      `**Payment Details:**\n` +
      `💳 M-Pesa Till: 6034186\n` +
      `🏢 Name: Starlife Advert US Agency`
    );
  }
});

console.log('✅ Starlife Advert Bot is running!');

// Clean shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
