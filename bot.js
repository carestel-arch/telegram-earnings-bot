function doGet(e) {
  try {
    // Check if event object exists
    if (!e) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'No request parameters provided'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const parameters = e.parameter || {};
    const action = parameters.action;
    const memberId = parameters.memberId;
    
    console.log('Received request with parameters:', parameters);
    
    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        message: 'Missing action parameter'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'getEarnings') {
      if (!memberId) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          message: 'Missing memberId parameter'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      return getEarningsData(memberId);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Invalid action: ' + action
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Error in doGet:', error);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: 'Server error: ' + error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getEarningsData(memberId) {
  try {
    // Get the main sheet - adjust sheet name if different
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Form responses 1');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    console.log('Searching for member:', memberId);
    console.log('Total rows:', data.length);
    
    // Find column indices by header names - CORRECTED MAPPING
    const memberIdCol = headers.indexOf('Member ID');
    const investmentCol = headers.indexOf('Investment Amount (USD)');
    
    // For the earnings columns
    const dailyProfitCol = findColumnIndex(headers, ['Daily Profit', 'Daily Earnings']);
    const daysPassedCol = findColumnIndex(headers, ['Days Passed', 'Days Active']);
    const totalProfitCol = findColumnIndex(headers, ['Total Profit Earned', 'Total Profit']);
    
    console.log('Column indices found:', {
      memberIdCol,
      investmentCol, 
      dailyProfitCol,
      daysPassedCol,
      totalProfitCol
    });
    
    // Validate we found the necessary columns
    if (memberIdCol === -1) {
      return createErrorResponse('Member ID column not found in sheet');
    }
    
    // Search for member ID in the sheet
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const currentMemberId = row[memberIdCol];
      
      if (currentMemberId && currentMemberId.toString().trim() === memberId.toString().trim()) {
        console.log('Found member at row:', i + 1);
        
        const investment = parseFloat(row[investmentCol]) || 0;
        const dailyEarnings = dailyProfitCol !== -1 ? (parseFloat(row[dailyProfitCol]) || 0) : 0;
        const totalProfit = totalProfitCol !== -1 ? (parseFloat(row[totalProfitCol]) || 0) : 0;
        const daysActive = daysPassedCol !== -1 ? (parseInt(row[daysPassedCol]) || 0) : 0;
        
        console.log('Extracted data:', { investment, dailyEarnings, totalProfit, daysActive });
        
        const message = `💰 **Earnings Summary**\n\nMember ID: ${memberId}\n💵 Investment: $${investment.toFixed(2)}\n📊 Daily Earnings: $${dailyEarnings.toFixed(2)}\n💰 Total Profit: $${totalProfit.toFixed(2)}\n📅 Days Active: ${daysActive} days`;
        
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          message: message
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
    
    // Member not found
    console.log('Member not found:', memberId);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: '❌ Member ID not found. Please check your Member ID and try again.'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    console.error('Error in getEarningsData:', error.toString(), error.stack);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: '❌ Server error. Please try again later.'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper function to find column by multiple possible header names
function findColumnIndex(headers, possibleNames) {
  for (const name of possibleNames) {
    const index = headers.indexOf(name);
    if (index !== -1) return index;
  }
  return -1;
}

// Helper function for error responses
function createErrorResponse(message) {
  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: '❌ ' + message
  })).setMimeType(ContentService.MimeType.JSON);
}

// Test function - run this directly in Apps Script to debug
function testEarnings() {
  // Test with a known member ID
  const testMemberId = 'SLA-087';
  console.log('Testing with member ID:', testMemberId);
  
  const result = getEarningsData(testMemberId);
  console.log('Test result:', result.getContent());
  
  return result;
}

// Debug function to check column headers
function debugHeaders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Form responses 1');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  console.log('All headers with indices:');
  headers.forEach((header, index) => {
    console.log(`Column ${index}: "${header}"`);
  });
  
  return headers;
}
