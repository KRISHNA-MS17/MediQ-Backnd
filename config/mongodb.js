import mongoose from "mongoose";

const connectDB = async () => {
    try {
        // Set up connection event listeners
        mongoose.connection.on('connected', () => {
            console.log("✅ Database Connected")
        })

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message)
        })

        mongoose.connection.on('disconnected', () => {
            console.log('⚠️  MongoDB disconnected')
        })

        // Get MongoDB URI from environment or use default
        // Handle empty string case (when .env has MONGODB_URI= but no value)
        const mongoUri = (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) ||"mongodb+srv://Naveen:Naveen%401234@cluster0.ejclart.mongodb.net/DocPlus?retryWrites=true&w=majority"


        // Validate connection string format
        if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
            console.error('❌ Invalid MongoDB connection string!')
            console.error('   Expected format: mongodb://localhost:27017 or mongodb+srv://cluster.mongodb.net')
            console.error('   Current value:', mongoUri ? `"${mongoUri.substring(0, 50)}..."` : 'undefined')
            console.error('')
            console.error('📝 Set MONGODB_URI in your .env file:')
            console.error('   MONGODB_URI=mongodb://localhost:27017/docplus_app')
            console.error('   OR for MongoDB Atlas:')
            console.error('   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/docplus_app')
            throw new Error('Invalid MongoDB connection string format')
        }

        // Additional validation for mongodb+srv:// format
        if (mongoUri.startsWith('mongodb+srv://')) {
            // Check if it has a proper hostname (not just a number or invalid format)
            const srvMatch = mongoUri.match(/^mongodb\+srv:\/\/(?:[^:]+:[^@]+@)?([^\/\?]+)/)
            if (!srvMatch || !srvMatch[1] || srvMatch[1].match(/^\d+$/)) {
                console.error('❌ Invalid MongoDB Atlas connection string!')
                console.error('   The hostname appears to be invalid or just a number.')
                console.error('   Current value:', mongoUri.substring(0, 50))
                console.error('')
                console.error('📝 Correct format for MongoDB Atlas:')
                console.error('   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/docplus_app')
                console.error('')
                console.error('💡 If you don\'t have MongoDB Atlas, use local MongoDB:')
                console.error('   MONGODB_URI=mongodb://localhost:27017/docplus_app')
                throw new Error('Invalid MongoDB Atlas connection string format')
            }
        }

        // Extract database name from URI if present, otherwise use default
        // Handle both formats: /database and /database?query
        let dbName = 'docplus_app'
        const uriParts = mongoUri.split('/')
        if (uriParts.length > 3) {
            const dbPart = uriParts[3].split('?')[0] // Remove query parameters
            if (dbPart && dbPart.trim()) {
                dbName = dbPart.trim()
            }
        }

        // Connect to MongoDB
        await mongoose.connect(mongoUri, {
            dbName: dbName
        })

        console.log('✅ MongoDB connection established')
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error.message)
        throw error
    }
}

export default connectDB