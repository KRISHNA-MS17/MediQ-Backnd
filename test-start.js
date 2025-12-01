// Quick test to verify bcrypt works
import bcrypt from 'bcrypt';

async function test() {
  try {
    const hash = await bcrypt.hash('test', 10);
    console.log('✅ bcrypt is working!');
    console.log('Hash:', hash.substring(0, 20) + '...');
    process.exit(0);
  } catch (error) {
    console.error('❌ bcrypt error:', error.message);
    process.exit(1);
  }
}

test();


