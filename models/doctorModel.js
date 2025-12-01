import mongoose from "mongoose";

const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    image: { type: String, required: true },
    speciality: { type: String, required: true },
    degree: { type: String, required: true },
    experience: { type: String, required: true },
    about: { type: String, required: true },
    available: { type: Boolean, default: true },
    fees: { type: Number, required: true },
    address: { type: Object, required: true },
    date: { type: Number, required: true },
    slots_booked: { type: Object, default: {} },
    // Queue Management Fields (Legacy - kept for backward compatibility)
    averageDiagnosisTime: { type: Number, default: 10 }, // Average time per patient in minutes
    currentToken: { type: Number, default: 0 }, // Current token being treated
    queueStatus: { 
        type: Object, 
        default: {} // Format: { "2024-01-15": { currentToken: 5, totalTokens: 20 } }
    },
    // New: Per-slot queue status (more granular)
    slotQueueStatus: {
        type: Object,
        default: {} // Format: { "slotId": { currentToken: 2, totalTokens: 10, averageTime: 12.5 } }
    },
    // Location Fields
    location: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        address: { type: String, default: '' }
    }
}, { minimize: false })

const doctorModel = mongoose.models.doctor || mongoose.model("doctor", doctorSchema);

export default doctorModel;