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
import medicalAssistantRouter from './routes/medicalAssistantRoute.js'
import notificationRouter from './routes/notificationRoute.js'
import etaRouter from './routes/etaRoute.js'
import reviewRouter from './routes/reviewRoute.js'
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
    
    // CORS configuration - allow all origins by default, restrict if ALLOWED_ORIGINS is set
    app.use(cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            
            // If ALLOWED_ORIGINS is explicitly set, use it for restriction
            const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : [];
            
            // If ALLOWED_ORIGINS is set and not empty, check against it
            if (allowedOrigins.length > 0) {
                if (allowedOrigins.indexOf(origin) !== -1) {
                    callback(null, true);
                } else {
                    callback(new Error(`Origin ${origin} not allowed by CORS`));
                }
            } else {
                // If ALLOWED_ORIGINS is not set, allow all origins (both dev and production)
                callback(null, true);
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
    app.use('/api/medical-assistant', medicalAssistantRouter)
    app.use('/api/notifications', notificationRouter)
    app.use('/api/eta', etaRouter)
    app.use('/api/reviews', reviewRouter)

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