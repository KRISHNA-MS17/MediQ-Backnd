import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import adminRouter from './routes/adminRoute.js'
import doctorRouter from './routes/doctorRoute.js'
import userRouter from './routes/userRoute.js'
import queueRouter from './routes/queueRoute.js'
import availabilityRouter from './routes/availabilityRoute.js'
import bookingRouter from './routes/bookingRoute.js'
import slotQueueRouter from './routes/slotQueueRoute.js'
import { startNotificationJob } from './jobs/notificationJob.js'
import { initializeSocket } from './socket.js'

const startServer = async () => {
    // app config
    const app = express()
    const port = process.env.PORT || 4000
    connectDB()
    const cloudinaryConnected = await connectCloudinary()

    // Create HTTP server for Socket.IO
    const httpServer = createServer(app)

    // Initialize Socket.IO
    initializeSocket(httpServer)

    // middlewares
    app.use(express.json())
    
    // CORS configuration - allow all origins in development
    app.use(cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            // Allow all origins in development
            if (process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }
            // In production, you can specify allowed origins
            const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
            if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.length === 0) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization', 'token', 'aToken', 'dToken']
    }))

    // api endpoints
    app.use('/api/admin', adminRouter)
    app.use('/api/doctor', doctorRouter)
    app.use('/api/user', userRouter)
    app.use('/api/queue', queueRouter)
    app.use('/api/availability', availabilityRouter)
    app.use('/api/booking', bookingRouter)
    app.use('/api/slot-queue', slotQueueRouter)

    app.get('/',(req,res)=>{
        res.send('API WORKING')
    })

    httpServer.listen(port, '0.0.0.0', ()=> {
        console.log(`Server Started on http://0.0.0.0:${port}`)
        console.log(`Access from local network: http://YOUR_IP:${port}`)
        // Start notification background job
        startNotificationJob()
    })
}

startServer()