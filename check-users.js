import mongoose from 'mongoose';
import userModel from './models/userModel.js';
import 'dotenv/config';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/docplus_app';

async function checkUsers() {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB\n');

    const users = await userModel.find({}).sort({ _id: -1 }).select('name email _id createdAt');
    
    console.log(`📊 Total users in database: ${users.length}\n`);
    
    if (users.length > 0) {
      console.log('👥 All users:');
      users.forEach((user, index) => {
        const date = user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A';
        console.log(`  ${index + 1}. ${user.name} (${user.email})`);
        console.log(`     ID: ${user._id}`);
        console.log(`     Created: ${date}\n`);
      });
    } else {
      console.log('⚠️  No users found in database');
    }

    // Check for duplicate emails
    const emails = users.map(u => u.email);
    const duplicates = emails.filter((email, index) => emails.indexOf(email) !== index);
    if (duplicates.length > 0) {
      console.log('⚠️  Warning: Duplicate emails found:', duplicates);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkUsers();

