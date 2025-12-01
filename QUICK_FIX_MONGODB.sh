#!/bin/bash

# Quick fix script for MongoDB connection
echo "🔧 MongoDB Connection Quick Fix"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/docplus_app

# Server Port
PORT=4000

# Cloudinary (optional)
CLOUDINARY_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_SECRET_KEY=your_cloudinary_secret_key
EOF
    echo "✅ Created .env file with local MongoDB configuration"
else
    echo "📝 Updating .env file..."
    # Backup existing .env
    cp .env .env.backup
    echo "✅ Backed up existing .env to .env.backup"
    
    # Update MONGODB_URI if it exists, otherwise add it
    if grep -q "^MONGODB_URI=" .env; then
        # Replace existing MONGODB_URI
        sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI=mongodb://localhost:27017/docplus_app|' .env
        echo "✅ Updated MONGODB_URI to use local MongoDB"
    else
        # Add MONGODB_URI if it doesn't exist
        echo "" >> .env
        echo "# MongoDB Configuration" >> .env
        echo "MONGODB_URI=mongodb://localhost:27017/docplus_app" >> .env
        echo "✅ Added MONGODB_URI to .env"
    fi
fi

echo ""
echo "📋 Current MONGODB_URI:"
grep "^MONGODB_URI=" .env | head -1

echo ""
echo "⚠️  Make sure MongoDB is running:"
echo "   - If installed via Homebrew: brew services start mongodb-community"
echo "   - Or run: mongod"
echo ""
echo "🚀 Then start the server: npm start"

