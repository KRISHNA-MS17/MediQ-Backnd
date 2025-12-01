import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, 'node_modules', 'buffer-equal-constant-time', 'index.js');

try {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace SlowBuffer import with Buffer (Node.js v25+ compatibility)
    content = content.replace(
      /var SlowBuffer = require\('buffer'\)\.SlowBuffer;/,
      'var SlowBuffer = Buffer; // Node.js v25+ compatibility: SlowBuffer removed'
    );
    
    // Replace SlowBuffer.prototype.equal with Buffer.prototype.equal
    content = content.replace(/SlowBuffer\.prototype\.equal/g, 'Buffer.prototype.equal');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Fixed buffer-equal-constant-time for Node.js v25+');
  }
} catch (error) {
  console.error('❌ Error fixing buffer-equal-constant-time:', error.message);
  process.exit(1);
}

