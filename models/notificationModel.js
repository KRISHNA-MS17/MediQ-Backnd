import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    type: {
        type: String,
        enum: ['appointment_booked', 'queue_update', 'your_turn', 'appointment_reminder', 'appointment_cancelled'],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    appointmentId: { type: String, default: null },
    read: { type: Boolean, default: false },
    createdAt: { type: Number, default: Date.now },
    date: { type: String, default: null }, // For backward compatibility
});

const notificationModel = mongoose.models.notification || mongoose.model("notification", notificationSchema);

export default notificationModel;

