const fs = require('fs');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

async function main() {
  console.log('Querying Notion for today\'s quote...');

  // Build the API URL using string concatenation
  // (avoids template-literal issues in documentation)
  const API_URL = 'https://api.notion.com/v1/databases/' + DATABASE_ID + '/query';

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + NOTION_TOKEN,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        and: [
          { property: 'Display', formula: { checkbox: { equals: true } } },
          { property: 'Inactive', checkbox: { equals: false } }
        ]
      },
      page_size: 1
    })
  });

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    console.log('No active quote for today. Skipping.');
    return;
  }

  // ---- EXTRACT PROPERTIES ----
  const props = data.results[0].properties;
  const quote = props['Quote']?.title?.[0]?.plain_text || '';
  const author = props['Author']?.select?.name || '';
  const linkName = props['Link Name']?.rich_text?.[0]?.plain_text || '';
  const linkUrl = props['Link URL']?.url || '';
  const publishedRemarks = props['Published Remarks']?.rich_text?.[0]?.plain_text || '';
  const notionDate = props['Date']?.date?.start || '';

  if (!quote) {
    console.log('Quote field is empty. Skipping.');
    return;
  }

  const now = new Date().toISOString();

  // ---- SAVE current-quote.json ----
  const currentData = {
    quote,
    author,
    linkName,
    linkUrl,
    publishedRemarks,
    notionDate,
    updatedAt: now
  };
  fs.writeFileSync('current-quote.json', JSON.stringify(currentData, null, 2));
  console.log('Saved current-quote.json');

  // ---- APPEND TO history.json ----
  let history = [];
  try {
    history = JSON.parse(fs.readFileSync('history.json', 'utf8'));
  } catch (e) {
    // File doesn't exist yet — start fresh
  }
  history.unshift({
    date: notionDate,
    quote,
    author,
    updatedAt: now
  });
  fs.writeFileSync('history.json', JSON.stringify(history, null, 2));
  console.log('Appended to history.json (' + history.length + ' entries)');

  // ---- BUILD CREDITS HTML ----
  // Author: bold em-dash + author name (em-dash always present)
  const authorDisplay = author
    ? (author.startsWith('\u2014') ? author : '\u2014' + author)
    : '\u2014';
  const authorHtml = '<strong>' + esc(authorDisplay) + '</strong>';

  // Link: italic, hyperlinked if URL present
  let linkHtml = '';
  if (linkName && linkUrl) {
    linkHtml = '<em><a href="' + esc(linkUrl) + '" target="_blank">' + esc(linkName) + '</a></em>';
  } else if (linkName) {
    linkHtml = '<em>' + esc(linkName) + '</em>';
  }

  // Combine: bold author  |  italic linked text
  let creditsHtml = '';
  if (linkHtml) {
    creditsHtml = authorHtml + '&nbsp;&nbsp;|&nbsp;&nbsp;' + linkHtml;
  } else {
    creditsHtml = authorHtml;
  }

  // Published Remarks (optional line)
  let remarksHtml = '';
  if (publishedRemarks) {
    remarksHtml = '  <div class="remarks">' + esc(publishedRemarks) + '</div>\n';
  }

  // ---- GENERATE HTML ----
  const html = '<!DOCTYPE html>\n'
    + '<html lang="en">\n'
    + '<head>\n'
    + '  <meta charset="utf-8">\n'
    + '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
    + '  <title>Daily Quote</title>\n'
    + '  <link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">\n'
    + '  <style>\n'
    + '    * { margin: 0; padding: 0; box-sizing: border-box; }\n'
    + '    body {\n'
    + '      font-family: \'Open Sans\', sans-serif;\n'
    + '      padding: 32px;\n'
    + '      background: transparent;\n'
    + '      display: flex; flex-direction: column;\n'
    + '      justify-content: center;\n'
    + '      min-height: 100vh;\n'
    + '    }\n'
    + '    .quote {\n'
    + '      font-size: 1.4em; font-weight: 700;\n'
    + '      line-height: 1.4; color: #000;\n'
    + '    }\n'
    + '    .credits {\n'
    + '      margin-top: 16px; font-size: 0.9em;\n'
    + '      color: #555; line-height: 1.5;\n'
    + '    }\n'
    + '    .credits strong { color: #333; }\n'
    + '    .credits a { color: #555; text-decoration: underline; }\n'
    + '    .credits a:hover { color: #0000dd; }\n'
    + '    .remarks {\n'
    + '      margin-top: 8px; font-size: 0.85em;\n'
    + '      color: #444; line-height: 1.5;\n'
    + '    }\n'
    + '  </style>\n'
    + '</head>\n'
    + '<body>\n'
    + '  <div class="quote">' + esc(quote) + '</div>\n'
    + '  <div class="credits">' + creditsHtml + '</div>\n'
    + remarksHtml
    + '</body>\n'
    + '</html>';

  fs.writeFileSync('index.html', html);
  console.log('Generated index.html');
  console.log('Quote: "' + quote.substring(0, 60) + '..."');
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
