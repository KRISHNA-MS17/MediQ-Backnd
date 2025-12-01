import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

console.log('\n🔍 Checking Cloudinary Configuration...\n');

// Get and clean environment variables
const cloudName = (process.env.CLOUDINARY_NAME || '').replace(/^["']|["']$/g, '').trim();
const apiKey = (process.env.CLOUDINARY_API_KEY || '').replace(/^["']|["']$/g, '').trim();
const apiSecret = (process.env.CLOUDINARY_SECRET_KEY || '').replace(/^["']|["']$/g, '').trim();

console.log('📋 Current Configuration:');
console.log('   CLOUDINARY_NAME:', cloudName || '❌ MISSING');
console.log('   CLOUDINARY_API_KEY:', apiKey ? '✅ Set (***' + apiKey.slice(-4) + ')' : '❌ MISSING');
console.log('   CLOUDINARY_SECRET_KEY:', apiSecret ? '✅ Set (***' + apiSecret.slice(-4) + ')' : '❌ MISSING');
console.log('');

// Check if cloud name is placeholder
if (!cloudName || cloudName === 'YOUR_CLOUDINARY_NAME' || cloudName.includes('YOUR_CLOUDINARY')) {
    console.log('❌ ERROR: CLOUDINARY_NAME is still set to placeholder!\n');
    console.log('📝 To fix this:');
    console.log('   1. Go to: https://cloudinary.com/console');
    console.log('   2. Log in to your Cloudinary account');
    console.log('   3. Find your "Cloud Name" in the dashboard');
    console.log('   4. Open backend/.env file');
    console.log('   5. Update this line:');
    console.log('      CLOUDINARY_NAME="YOUR_CLOUDINARY_NAME"');
    console.log('   6. To this (replace with your actual cloud name, NO QUOTES):');
    console.log('      CLOUDINARY_NAME=your_actual_cloud_name');
    console.log('   7. Also remove quotes from other Cloudinary values:');
    console.log('      CLOUDINARY_API_KEY=991529449298138');
    console.log('      CLOUDINARY_SECRET_KEY=R6sy2keOvNZM1JR7-RwmHDIdRUA');
    console.log('   8. Restart your backend server');
    console.log('');
    process.exit(1);
}

// Check if all values are present
if (!cloudName || !apiKey || !apiSecret) {
    console.log('❌ ERROR: Missing Cloudinary configuration values!\n');
    process.exit(1);
}

// Try to configure Cloudinary
try {
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret
    });
    
    console.log('✅ Cloudinary configuration looks good!');
    console.log('   Cloud Name:', cloudName);
    console.log('   API Key:', '***' + apiKey.slice(-4));
    console.log('   API Secret:', '***' + apiSecret.slice(-4));
    console.log('');
    console.log('💡 If you still get upload errors, try:');
    console.log('   1. Restart your backend server');
    console.log('   2. Verify your Cloudinary credentials at: https://cloudinary.com/console');
    console.log('');
} catch (error) {
    console.log('❌ ERROR configuring Cloudinary:', error.message);
    console.log('');
    process.exit(1);
}

