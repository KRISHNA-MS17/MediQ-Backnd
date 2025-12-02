import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    docId: { type: String, required: true },
    slotDate: { type: String, required: true },
    slotTime: { type: String, required: true },
    userData: { type: Object, required: true },
    docData: { type: Object, required: true },
    amount: { type: Number, required: true },
    date: { type: Number, required: true },
    cancelled: { type: Boolean, default: false },
    payment: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false },
    // Slot-Based Queue Management Fields
    slotId: { type: String, default: null }, // Reference to availabilitySlot._id
    slotPeriod: { 
        type: String, 
        enum: ['MORNING', 'AFTERNOON', 'EVENING', 'CUSTOM'],
        default: null
    },
    slotTokenIndex: { type: Number, default: null }, // Token position within slot (1-based)
    estimatedStart: { type: Number, default: null }, // Timestamp when service should start
    actualConsultDuration: { type: Number, default: null }, // Actual duration in minutes (set when completed)
    status: {
        type: String,
        enum: ['BOOKED', 'WAITING', 'SERVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
        default: 'BOOKED'
    },
    // Serving state tracking
    servingStartedAt: { type: Number, default: null }, // Timestamp when doctor started serving
    servingEndedAt: { type: Number, default: null }, // Timestamp when service ended
    serviceDurationSec: { type: Number, default: null }, // Service duration in seconds
    // Legacy fields (kept for backward compatibility)
    tokenNumber: { type: Number, default: null }, // Deprecated: use slotTokenIndex
    travelTime: { type: Number, default: null }, // Patient's travel time in minutes (auto-calculated)
    estimatedWaitTime: { type: Number, default: null }, // Deprecated: use estimatedStart
    notificationSent: { 
        earlyWarning: { type: Boolean, default: false },
        approaching: { type: Boolean, default: false },
        yourTurn: { type: Boolean, default: false }
    },
    notificationSubscription: {
        subscribed: { type: Boolean, default: false },
        notifyWhenTokensAway: { type: Number, default: 2 },
        deviceToken: { type: String, default: null },
        subscribedAt: { type: Number, default: null },
        unsubscribedAt: { type: Number, default: null }
    }
})

const appointmentModel = mongoose.models.appointment || mongoose.model("appointment", appointmentSchema)

export default appointmentModel