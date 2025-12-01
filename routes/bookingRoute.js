import express from 'express';
import { bookSlotToken, getUserAppointments } from '../controllers/bookingController.js';
import authUser from '../middlewares/authUser.js';

const bookingRouter = express.Router();

// Book a token in a slot
bookingRouter.post('/book-slot-token', authUser, bookSlotToken);

// Get user's appointments with slot info
bookingRouter.get('/my-appointments', authUser, getUserAppointments);

export default bookingRouter;


