import express from 'express';
import { 
    bookSlotToken, 
    getUserAppointments,
    getAppointmentQueue,
    cancelAppointment,
    processPayment
} from '../controllers/bookingController.js';
import authUser from '../middlewares/authUser.js';

const bookingRouter = express.Router();

// Book a token in a slot
bookingRouter.post('/book-slot-token', authUser, bookSlotToken);

// Get user's appointments with slot info
bookingRouter.get('/my-appointments', authUser, getUserAppointments);

// Get queue information for a specific appointment
bookingRouter.get('/appointments/:appointmentId/queue', authUser, getAppointmentQueue);

// Cancel an appointment
bookingRouter.post('/appointments/:appointmentId/cancel', authUser, cancelAppointment);

// Process payment for an appointment
bookingRouter.post('/appointments/:appointmentId/payment', authUser, processPayment);

export default bookingRouter;
