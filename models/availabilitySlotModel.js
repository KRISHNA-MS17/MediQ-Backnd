import mongoose from "mongoose";

/**
 * Availability Slot Model
 * Stores doctor availability slots with per-slot queue management
 */
const availabilitySlotSchema = new mongoose.Schema({
    doctorId: { type: String, required: true, index: true },
    date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
    startTime: { type: String, required: true }, // Format: HH:MM (24-hour)
    endTime: { type: String, required: true }, // Format: HH:MM (24-hour)
    slotPeriod: { 
        type: String, 
        enum: ['MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM'],
        default: 'CUSTOM'
    },
    capacity: { type: Number, default: null }, // Optional max tokens
    // Recurring pattern (optional)
    isRecurring: { type: Boolean, default: false },
    recurringPattern: {
        daysOfWeek: [{ type: Number }], // 0=Sunday, 1=Monday, etc.
        repeatUntil: { type: String }, // YYYY-MM-DD
        repeatCount: { type: Number } // Number of weeks
    },
    // Queue management per slot
    totalTokens: { type: Number, default: 0 }, // Total tokens booked in this slot
    currentToken: { type: Number, default: 0 }, // Currently serving token (0 = not started)
    averageConsultationTime: { type: Number, default: 10 }, // Dynamic average in minutes
    consultationsCount: { type: Number, default: 0 }, // Number of completed consultations for EMA
    // Metadata
    createdAt: { type: Number, default: Date.now },
    updatedAt: { type: Number, default: Date.now },
    isActive: { type: Boolean, default: true } // Can disable without deleting
}, { minimize: false });

// Compound index for efficient queries
availabilitySlotSchema.index({ doctorId: 1, date: 1, startTime: 1 });

// Virtual: Check if slot is currently active (not past end time)
availabilitySlotSchema.virtual('isCurrentlyActive').get(function() {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    
    if (this.date < today) return false;
    if (this.date === today && currentTime >= this.endTime) return false;
    return this.isActive;
});

const availabilitySlotModel = mongoose.models.availabilitySlot || mongoose.model("availabilitySlot", availabilitySlotSchema);

export default availabilitySlotModel;


