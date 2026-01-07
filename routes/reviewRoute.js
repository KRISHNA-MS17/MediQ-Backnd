import express from 'express';
import { 
    submitReview, 
    getDoctorReviews,
    checkReviewExists
} from '../controllers/reviewController.js';
import authUser from '../middlewares/authUser.js';

const reviewRouter = express.Router();

// Test endpoint to verify route is working
reviewRouter.get('/test', (req, res) => {
    res.json({ success: true, message: 'Reviews API is working' });
});

// Submit a review for a completed appointment
reviewRouter.post('/submit', authUser, submitReview);

// Get reviews for a doctor
reviewRouter.get('/doctor/:doctorId', getDoctorReviews);

// Check if user has already reviewed an appointment
reviewRouter.get('/appointment/:appointmentId/check', authUser, checkReviewExists);

export default reviewRouter;

