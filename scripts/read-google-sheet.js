// Script to read a Google Sheet
// Usage: This will be run in the browser console with access to Chrome extension APIs

const sheetId = '15569wazfERXVJr3hrU3MVgo-EsI4Nwr6XKor419OkFw';
const gid = '350706179';

async function readGoogleSheet() {
  try {
    // Get access token from Chrome storage (if available)
    // Or use the extension's OAuth service
    
    // First, get spreadsheet metadata to find sheet name from gid
    const token = await getValidAccessToken(); // This would need to be available
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get spreadsheet: ${response.status}`);
    }
    
    const spreadsheet = await response.json();
    const sheets = spreadsheet.sheets || [];
    
    // Find sheet by gid (sheetId property)
    const targetSheet = sheets.find(sheet => 
      sheet.properties.sheetId.toString() === gid
    );
    
    if (!targetSheet) {
      throw new Error(`Sheet with gid ${gid} not found`);
    }
    
    const sheetName = targetSheet.properties.title;
    console.log(`Found sheet: "${sheetName}"`);
    
    // Read the sheet data
    const dataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A:Z`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    if (!dataResponse.ok) {
      throw new Error(`Failed to read sheet data: ${dataResponse.status}`);
    }
    
    const data = await dataResponse.json();
    const rows = data.values || [];
    
    console.log(`Read ${rows.length} rows from sheet "${sheetName}"`);
    console.log('First 10 rows:');
    rows.slice(0, 10).forEach((row, i) => {
      console.log(`Row ${i + 1}:`, row);
    });
    
    return { sheetName, rows };
  } catch (error) {
    console.error('Error reading sheet:', error);
    throw error;
  }
}

// Note: This script needs to be run in the browser context with access to:
// - getValidAccessToken() function from the extension
// - Chrome extension APIs

console.log('To use this script, you need to run it in the browser console with access to the extension context.');

