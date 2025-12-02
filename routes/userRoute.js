import express from 'express'
import { bookAppointment, cancelAppointment, getProfile, listAppointment, loginUser, paymentRazorpay, registerUser, updateProfile, verifyRazorpay, getPatientQueueStatus, updateTravelTime } from '../controllers/userController.js';
import { getRazorpayCheckoutPage } from '../controllers/paymentController.js';
import { getAppointmentHistory, getAppointmentDetails } from '../controllers/appointmentHistoryController.js';
import authUser from '../middlewares/authUser.js';
import upload from '../middlewares/multer.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.get('/get-profile', authUser, getProfile)
userRouter.post('/update-profile',upload.single('image'), authUser, updateProfile)
userRouter.post('/book-appointment', authUser, bookAppointment)
// Appointment endpoints - specific routes before generic ones
userRouter.get('/appointments/history', authUser, getAppointmentHistory)
userRouter.get('/appointments/:appointmentId', authUser, getAppointmentDetails)
userRouter.get('/appointments', authUser, listAppointment)
userRouter.post('/cancel-appointment', authUser, cancelAppointment)
userRouter.post('/queue-status', authUser, getPatientQueueStatus)
userRouter.post('/update-travel-time', authUser, updateTravelTime)
userRouter.post('/payment-razorpay', authUser, paymentRazorpay)
userRouter.post('/verifyRazorpay', authUser, verifyRazorpay)
// Payment checkout page - must be before other routes to avoid conflicts
userRouter.get('/payment-checkout', authUser, getRazorpayCheckoutPage)

export default userRouter