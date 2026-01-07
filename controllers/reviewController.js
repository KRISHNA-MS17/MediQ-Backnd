import reviewModel from '../models/reviewModel.js';
import appointmentModel from '../models/appointmentModel.js';
import doctorModel from '../models/doctorModel.js';

/**
 * Submit a review for a completed appointment
 */
export const submitReview = async (req, res) => {
    try {
        const { appointmentId, rating, reviewText } = req.body;
        const { userId } = req.body; // From authUser middleware

        console.log('[REVIEW] Submit review request:', {
            appointmentId,
            rating,
            userId,
            hasReviewText: !!reviewText
        });

        // Validate input
        if (!appointmentId || !rating) {
            console.log('[REVIEW] Validation failed - missing appointmentId or rating');
            return res.json({ 
                success: false, 
                message: "Appointment ID and rating are required" 
            });
        }

        const ratingNum = parseInt(rating);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            console.log('[REVIEW] Validation failed - invalid rating:', rating);
            return res.json({ 
                success: false, 
                message: "Rating must be between 1 and 5" 
            });
        }

        // Verify appointment exists and belongs to user
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            console.log('[REVIEW] Appointment not found:', appointmentId);
            return res.json({ 
                success: false, 
                message: "Appointment not found" 
            });
        }

        console.log('[REVIEW] Appointment found:', {
            appointmentId: appointment._id,
            appointmentUserId: appointment.userId,
            requestUserId: userId,
            appointmentStatus: appointment.status,
            isCompleted: appointment.isCompleted
        });

        if (appointment.userId !== userId) {
            console.log('[REVIEW] Unauthorized - userId mismatch');
            return res.json({ 
                success: false, 
                message: "Unauthorized access" 
            });
        }

        // Verify appointment is completed - check both status field and isCompleted flag
        const isCompleted = appointment.status === 'COMPLETED' || 
                          appointment.status === 'completed' || 
                          appointment.isCompleted === true;
        
        if (!isCompleted) {
            console.log('[REVIEW] Appointment not completed:', {
                status: appointment.status,
                isCompleted: appointment.isCompleted
            });
            return res.json({ 
                success: false, 
                message: `You can only review completed appointments. Current status: ${appointment.status || 'unknown'}` 
            });
        }

        // Check if review already exists
        const existingReview = await reviewModel.findOne({ appointmentId });
        if (existingReview) {
            console.log('[REVIEW] Review already exists for appointment:', appointmentId);
            return res.json({ 
                success: false, 
                message: "You have already submitted a review for this appointment" 
            });
        }

        // Create review
        console.log('[REVIEW] Creating review with data:', {
            appointmentId,
            doctorId: appointment.docId,
            userId,
            rating: ratingNum,
            reviewTextLength: reviewText?.trim().length || 0
        });

        const review = await reviewModel.create({
            appointmentId,
            doctorId: appointment.docId,
            userId,
            rating: ratingNum,
            reviewText: reviewText?.trim() || '',
            createdAt: Date.now()
        });

        console.log('[REVIEW] Review created successfully:', review._id);

        // Update doctor's rating statistics
        try {
            await updateDoctorRatings(appointment.docId);
            console.log('[REVIEW] Doctor ratings updated successfully');
        } catch (ratingError) {
            console.error('[REVIEW] Error updating doctor ratings (non-fatal):', ratingError);
            // Don't fail the review submission if rating update fails
        }

        console.log('[REVIEW] Review submission successful');
        res.json({
            success: true,
            message: "Review submitted successfully",
            data: review
        });
    } catch (error) {
        console.error('[REVIEW] Error submitting review:', error);
        console.error('[REVIEW] Error details:', {
            message: error.message,
            code: error.code,
            name: error.name,
            stack: error.stack
        });
        
        if (error.code === 11000) {
            // Duplicate key error (appointmentId already exists)
            return res.json({ 
                success: false, 
                message: "You have already submitted a review for this appointment" 
            });
        }
        
        res.json({ 
            success: false, 
            message: error.message || "Failed to submit review" 
        });
    }
};

/**
 * Get reviews for a doctor
 */
export const getDoctorReviews = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { limit = 20, skip = 0 } = req.query;

        const reviews = await reviewModel
            .find({ doctorId })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .select('rating reviewText createdAt userId')
            .lean();

        res.json({
            success: true,
            data: reviews
        });
    } catch (error) {
        console.error('Error getting doctor reviews:', error);
        res.json({ 
            success: false, 
            message: error.message || "Failed to get reviews" 
        });
    }
};

/**
 * Check if user has already reviewed an appointment
 */
export const checkReviewExists = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { userId } = req.body; // From authUser middleware

        const review = await reviewModel.findOne({ appointmentId, userId });
        
        res.json({
            success: true,
            hasReview: !!review,
            review: review || null
        });
    } catch (error) {
        console.error('Error checking review:', error);
        res.json({ 
            success: false, 
            message: error.message || "Failed to check review" 
        });
    }
};

/**
 * Helper function to update doctor's rating statistics
 */
async function updateDoctorRatings(doctorId) {
    try {
        const reviews = await reviewModel.find({ doctorId });
        
        if (reviews.length === 0) {
            // No reviews yet, set default values
            await doctorModel.findByIdAndUpdate(doctorId, {
                averageRating: 0,
                totalRatings: 0
            });
            return;
        }

        const totalRatings = reviews.length;
        const sumRatings = reviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = sumRatings / totalRatings;

        await doctorModel.findByIdAndUpdate(doctorId, {
            averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal place
            totalRatings: totalRatings
        });

        console.log(`Updated doctor ${doctorId} ratings: ${averageRating.toFixed(1)} (${totalRatings} reviews)`);
    } catch (error) {
        console.error('Error updating doctor ratings:', error);
    }
}

