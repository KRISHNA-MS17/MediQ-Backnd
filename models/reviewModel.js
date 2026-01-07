import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
    appointmentId: { 
        type: String, 
        required: true,
        unique: true // One review per appointment
    },
    doctorId: { 
        type: String, 
        required: true,
        index: true // For efficient queries
    },
    userId: { 
        type: String, 
        required: true 
    },
    rating: { 
        type: Number, 
        required: true,
        min: 1,
        max: 5
    },
    reviewText: { 
        type: String, 
        default: '',
        maxlength: 1000
    },
    createdAt: { 
        type: Number, 
        default: Date.now 
    }
}, { minimize: false });

// Index for efficient doctor rating queries
reviewSchema.index({ doctorId: 1, createdAt: -1 });

const reviewModel = mongoose.models.review || mongoose.model("review", reviewSchema);

export default reviewModel;

