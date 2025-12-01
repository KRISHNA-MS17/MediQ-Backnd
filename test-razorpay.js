import 'dotenv/config';
import razorpay from 'razorpay';

console.log('🧪 Testing Razorpay Configuration...\n');

// Check environment variables
const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const currency = process.env.CURRENCY || 'INR';

console.log('📋 Configuration Check:');
console.log('  RAZORPAY_KEY_ID:', keyId ? `${keyId.substring(0, 8)}...` : '❌ NOT SET');
console.log('  RAZORPAY_KEY_SECRET:', keySecret ? '✅ SET' : '❌ NOT SET');
console.log('  CURRENCY:', currency);
console.log('');

if (!keyId || !keySecret) {
  console.error('❌ Razorpay keys are missing!');
  console.log('\n📝 Please add to your backend/.env file:');
  console.log('   RAZORPAY_KEY_ID=your_key_id');
  console.log('   RAZORPAY_KEY_SECRET=your_key_secret');
  console.log('   CURRENCY=INR');
  process.exit(1);
}

// Initialize Razorpay
let razorpayInstance;
try {
  razorpayInstance = new razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
  console.log('✅ Razorpay instance created successfully');
} catch (error) {
  console.error('❌ Failed to create Razorpay instance:', error.message);
  process.exit(1);
}

// Test: Create a test order (1 rupee)
async function testRazorpay() {
  try {
    console.log('\n🧪 Testing order creation...');
    const options = {
      amount: 100, // 1 rupee in paise
      currency: currency,
      receipt: `test_${Date.now()}`,
    };

    const order = await razorpayInstance.orders.create(options);
    console.log('✅ Test order created successfully!');
    console.log('   Order ID:', order.id);
    console.log('   Amount:', order.amount / 100, currency);
    console.log('   Status:', order.status);
    console.log('\n🎉 Razorpay is working correctly!');
    
    // Clean up: Cancel the test order (optional)
    // Note: Razorpay doesn't have a cancel API for orders, but test orders are fine
    
  } catch (error) {
    console.error('❌ Razorpay test failed:', error.message);
    if (error.statusCode === 401) {
      console.error('   This usually means your API keys are incorrect.');
    } else if (error.statusCode === 400) {
      console.error('   This usually means there\'s an issue with the request format.');
    }
    console.error('\n📝 Please check:');
    console.error('   1. Your RAZORPAY_KEY_ID is correct');
    console.error('   2. Your RAZORPAY_KEY_SECRET is correct');
    console.error('   3. Your Razorpay account is active');
    process.exit(1);
  }
}

testRazorpay();

