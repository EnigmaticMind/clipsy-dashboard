// Sheet formatting functions

import { getValidAccessToken } from '../googleSheetsOAuth'
import { GOOGLE_SHEETS_API_BASE } from './types'
import { COLUMNS } from './constants'

// Apply formatting to make the sheet look better
export async function applySheetFormatting(
  sheetId: string,
  sheetName: string,
  numColumns: number,
  dataRows: string[][]
): Promise<void> {
  const token = await getValidAccessToken()
  
  // Get sheet ID (not sheet name) for batchUpdate
  const spreadsheetResponse = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  )
  
  if (!spreadsheetResponse.ok) {
    return // Fail silently for formatting
  }
  
  const spreadsheet = await spreadsheetResponse.json()
  const sheet = spreadsheet.sheets.find((s: { properties: { title: string } }) => s.properties.title === sheetName)
  
  if (!sheet) {
    return
  }
  
  const sheetIdNum = sheet.properties.sheetId
  
  // Build formatting requests
  const requests: Array<Record<string, unknown>> = []
  
  // First, unmerge any existing merged cells in the data range to ensure clean state
  // Unmerge all cells from row 2 onwards (row 1 is header) to ensure data is visible
  if (dataRows.length > 0) {
    const dataStartRow = 1 // Row 2 (0-based index 1, after header)
    const dataEndRow = dataRows.length // Last data row
    requests.push({
      unmergeCells: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: dataStartRow,
          endRowIndex: dataStartRow + dataEndRow,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        }
      }
    })
  }
  
  // 1. Freeze header row (row 1) - keeps header visible when scrolling
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: sheetIdNum,
        gridProperties: {
          frozenRowCount: 1
        }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  })
  
  // 2. Bold header row with light blue background
  requests.push({
    repeatCell: {
      range: {
        sheetId: sheetIdNum,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: numColumns
      },
      cell: {
        userEnteredFormat: {
          textFormat: {
            bold: true
          },
          backgroundColor: {
            red: 0.9,
            green: 0.95,
            blue: 1.0
          }
        }
      },
      fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor'
    }
  })
  
  // 3. Auto-resize columns to fit content
  requests.push({
    autoResizeDimensions: {
      dimensions: {
        sheetId: sheetIdNum,
        dimension: 'COLUMNS',
        startIndex: 0,
        endIndex: numColumns
      }
    }
  })
  
  // 4. Remove banded rows (we'll apply custom colors instead)
  // 5. Format price columns as currency (column K = Price, column O = Variation Price)
  // Price is column 11 (index 10), Variation Price is column 15 (index 14)
  if (numColumns > 10) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1, // Start after header
          endRowIndex: 10000,
          startColumnIndex: 10, // Price column
          endColumnIndex: 11
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'CURRENCY',
              pattern: '"$"#,##0.00'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  if (numColumns > 14) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 14, // Variation Price column
          endColumnIndex: 15
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'CURRENCY',
              pattern: '"$"#,##0.00'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  // 5b. Format Processing Min and Processing Max as numbers (columns T and U, indices 19 and 20)
  if (numColumns > 19) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 19, // Processing Min column
          endColumnIndex: 20
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  if (numColumns > 20) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 20, // Processing Max column
          endColumnIndex: 21
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  // 5c. Format Shipping Profile ID as number (column S, index 18)
  if (numColumns > 18) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 18, // Shipping Profile ID column
          endColumnIndex: 19
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: 'NUMBER',
              pattern: '0'
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    })
  }
  
  // 6. Wrap text for Description column (column C, index 2) so long descriptions are visible
  if (numColumns > 2) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 1,
          endRowIndex: 10000,
          startColumnIndex: 2, // Description column
          endColumnIndex: 3
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    })
  }
  
  // 7. Add filter to header row - allows sorting and filtering
  requests.push({
    setBasicFilter: {
      filter: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: numColumns
        }
      }
    }
  })
  
  // 8. Group variations together with improved visual hierarchy
  // Identify listing groups (parent row + variation rows)
  const listingGroups: Array<{ parentRow: number; variationRows: number[] }> = []
  let currentParentRow = -1
  let currentVariations: number[] = []
  
  for (let i = 0; i < dataRows.length; i++) {
    const listingId = dataRows[i][COLUMNS.listing_id]?.toString().trim()
    const rowIndex = i + 2 // +2 because row 1 is header, and Sheets API is 1-based
    
    if (listingId && listingId !== '') {
      // This is a parent row (product/listing row)
      // Save previous group if it had variations
      if (currentParentRow >= 0 && currentVariations.length > 0) {
        listingGroups.push({ parentRow: currentParentRow, variationRows: currentVariations })
      }
      // Start new group
      currentParentRow = rowIndex
      currentVariations = []
    } else {
      // This is a variation row
      if (currentParentRow >= 0) {
        currentVariations.push(rowIndex)
      }
    }
  }
  // Save last group
  if (currentParentRow >= 0) {
    listingGroups.push({ parentRow: currentParentRow, variationRows: currentVariations })
  }
  
  // Apply grey background to all parent rows (products)
  for (const group of listingGroups) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheetIdNum,
          startRowIndex: group.parentRow - 1, // Convert to 0-based
          endRowIndex: group.parentRow, // Exclusive
          startColumnIndex: 0,
          endColumnIndex: numColumns
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.9,  // Grey
              green: 0.9,
              blue: 0.9
            }
          }
        },
        fields: 'userEnteredFormat.backgroundColor'
      }
    })
  }
  
  // Apply white background to all variation rows
  for (const group of listingGroups) {
    if (group.variationRows.length > 0) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetIdNum,
            startRowIndex: group.variationRows[0] - 1, // Convert to 0-based
            endRowIndex: group.variationRows[group.variationRows.length - 1], // Exclusive, 1-based
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 1.0,  // White
                green: 1.0,
                blue: 1.0
              }
            }
          },
          fields: 'userEnteredFormat.backgroundColor'
        }
      })
    }
  }
  
  // Also handle standalone rows (listings without variations that aren't in groups)
  // Find all parent rows
  const allParentRows: number[] = []
  for (let i = 0; i < dataRows.length; i++) {
    const listingId = dataRows[i][COLUMNS.listing_id]?.toString().trim()
    if (listingId && listingId !== '') {
      allParentRows.push(i + 2) // +2 for header and 1-based
    }
  }
  
  // Apply grey to standalone parent rows (those without variations in the next row)
  for (const parentRow of allParentRows) {
    const isInGroup = listingGroups.some(g => g.parentRow === parentRow)
    if (isInGroup) {
      const group = listingGroups.find(g => g.parentRow === parentRow)!
      if (group.variationRows.length === 0) {
        // Standalone listing, already handled above
      }
    } else {
      // Shouldn't happen, but handle it
      requests.push({
        repeatCell: {
          range: {
            sheetId: sheetIdNum,
            startRowIndex: parentRow - 1,
            endRowIndex: parentRow,
            startColumnIndex: 0,
            endColumnIndex: numColumns
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: {
                red: 0.9,
                green: 0.9,
                blue: 0.9
              }
            }
          },
          fields: 'userEnteredFormat.backgroundColor'
        }
      })
    }
  }
  
  // Apply all formatting in one batch
  const formatResponse = await fetch(
    `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests
      })
    }
  )
  
  if (!formatResponse.ok) {
    const error = await formatResponse.json().catch(() => ({ error: 'Failed to apply formatting' }))
    console.error('Failed to apply sheet formatting:', error)
    // Don't throw - formatting is non-critical
    return
  }
  
  // Collapse all created row groups by default
  const collapseRequests: Array<Record<string, unknown>> = []
  
  // Find all addDimensionGroup requests we made and create collapse requests for them
  for (const request of requests) {
    if (request.addDimensionGroup) {
      const groupRequest = request.addDimensionGroup as { range?: { sheetId?: number; dimension?: string; startIndex?: number; endIndex?: number } }
      if (groupRequest.range?.dimension === 'ROWS' && groupRequest.range.startIndex !== undefined && groupRequest.range.endIndex !== undefined) {
        collapseRequests.push({
          updateDimensionGroup: {
            range: {
              sheetId: sheetIdNum,
              dimension: 'ROWS',
              startIndex: groupRequest.range.startIndex,
              endIndex: groupRequest.range.endIndex
            },
            collapsed: true
          }
        })
      }
    }
  }
  
  // Collapse all created row groups by default
  if (collapseRequests.length > 0) {
    // Collapse groups in a separate batch update
    await fetch(
      `${GOOGLE_SHEETS_API_BASE}/spreadsheets/${sheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: collapseRequests
        })
      }
    ).catch(err => {
      console.error('Failed to collapse groups:', err)
      // Don't throw - collapsing is non-critical
    })
  }
}

