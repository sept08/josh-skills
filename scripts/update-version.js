const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node update-version.js <version>');
  process.exit(1);
}

const marketplacePath = path.resolve(__dirname, '../.claude-plugin/marketplace.json');
const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf8'));
marketplace.metadata.version = version;
fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
console.log(`Updated marketplace.json version to ${version}`);
