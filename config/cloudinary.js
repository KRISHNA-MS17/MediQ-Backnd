import { v2 as cloudinary } from 'cloudinary'

const connectCloudinary = async () => {
    try {
        // Check if all required environment variables are present
        if ( !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_SECRET_KEY) {
            console.error('❌ Cloudinary configuration missing! Please set the following environment variables:');
            console.error('   CLOUDINARY_NAME=your_cloudinary_cloud_name');
            console.error('   CLOUDINARY_API_KEY=your_cloudinary_api_key');
            console.error('   CLOUDINARY_SECRET_KEY=your_cloudinary_secret_key');
            console.error('');
            console.error('📝 Create a .env file in the backend directory with these variables.');
            console.error('🔗 Get your credentials from: https://cloudinary.com/console');
            return false;
        }

        // Validate cloud name is not a placeholder
        if (process.env.CLOUDINARY_NAME === 'YOUR_CLOUDINARY_NAME' || 
            process.env.CLOUDINARY_NAME === '"YOUR_CLOUDINARY_NAME"' ||
            process.env.CLOUDINARY_NAME.includes('YOUR_CLOUDINARY')) {
            console.error('❌ Cloudinary cloud name is still set to placeholder!');
            console.error('   Current value:', process.env.CLOUDINARY_NAME);
            console.error('');
            console.error('📝 To fix:');
            console.error('   1. Go to: https://cloudinary.com/console');
            console.error('   2. Log in to your account');
            console.error('   3. Find your "Cloud Name" in the dashboard');
            console.error('   4. Update CLOUDINARY_NAME in .env file with your actual cloud name');
            console.error('   5. Remove quotes around the value');
            console.error('');
            console.error('   Example: CLOUDINARY_NAME=your_actual_cloud_name');
            return false;
        }

        // Remove quotes if present and trim whitespace
        const cloudName = (process.env.CLOUDINARY_NAME || '').replace(/^["']|["']$/g, '').trim()
        const apiKey = (process.env.CLOUDINARY_API_KEY || '').replace(/^["']|["']$/g, '').trim()
        const apiSecret = (process.env.CLOUDINARY_SECRET_KEY || '').replace(/^["']|["']$/g, '').trim()

        // Validate all values are present after cleaning
        if (!cloudName || !apiKey || !apiSecret) {
            console.error('❌ Cloudinary configuration incomplete after cleaning!');
            console.error('   cloud_name:', cloudName || 'MISSING');
            console.error('   api_key:', apiKey ? '***' + apiKey.slice(-4) : 'MISSING');
            console.error('   api_secret:', apiSecret ? '***' + apiSecret.slice(-4) : 'MISSING');
            return false;
        }

        // Check if cloud name is still placeholder
        if (cloudName === 'YOUR_CLOUDINARY_NAME' || cloudName.includes('YOUR_CLOUDINARY')) {
            console.error('❌ Cloudinary cloud name is still set to placeholder!');
            console.error('   Current value:', cloudName);
            console.error('');
            console.error('📝 To fix:');
            console.error('   1. Go to: https://cloudinary.com/console');
            console.error('   2. Log in to your account');
            console.error('   3. Find your "Cloud Name" in the dashboard');
            console.error('   4. Update CLOUDINARY_NAME in .env file with your actual cloud name');
            console.error('   5. Remove quotes around the value');
            console.error('');
            console.error('   Example: CLOUDINARY_NAME=your_actual_cloud_name');
            return false;
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
        });

        console.log('✅ Cloudinary configured successfully');
        console.log('   Cloud Name:', process.env.CLOUDINARY_NAME);
        return true;
    } catch (error) {
        console.error('❌ Error configuring Cloudinary:', error.message);
        return false;
    }
}

export default connectCloudinary