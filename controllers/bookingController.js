import appointmentModel from '../models/appointmentModel.js';
import availabilitySlotModel from '../models/availabilitySlotModel.js';
import doctorModel from '../models/doctorModel.js';
import userModel from '../models/userModel.js';

/**
 * Atomic slot-based token booking
 * Uses findOneAndUpdate to ensure no duplicate tokens
 */
export const bookSlotToken = async (req, res) => {
    try {
        const { slotId, travelTime } = req.body;
        const { userId } = req.body; // Get from authUser middleware

        if (!userId || !slotId) {
            return res.json({ success: false, message: "User ID and Slot ID required" });
        }

        // Get slot
        const slot = await availabilitySlotModel.findById(slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        // Check if slot is still available (not past end time)
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

        if (slot.date < today || (slot.date === today && slot.endTime <= currentTime)) {
            return res.json({ success: false, message: "Slot has ended. Cannot book." });
        }

        // Check capacity if set
        if (slot.capacity && slot.totalTokens >= slot.capacity) {
            return res.json({ success: false, message: "Slot is full" });
        }

        // Atomic token assignment using findOneAndUpdate
        const updatedSlot = await availabilitySlotModel.findOneAndUpdate(
            { _id: slotId },
            { 
                $inc: { totalTokens: 1 },
                $set: { updatedAt: Date.now() }
            },
            { new: true, returnDocument: 'after' }
        );

        if (!updatedSlot) {
            return res.json({ success: false, message: "Failed to assign token" });
        }

        const assignedTokenIndex = updatedSlot.totalTokens;

        // Calculate estimated start time
        const slotStart = new Date(`${slot.date}T${slot.startTime}:00`);
        const estimatedMinutes = (assignedTokenIndex - 1) * slot.averageConsultationTime;
        const estimatedStart = slotStart.getTime() + (estimatedMinutes * 60 * 1000);

        // Get user and doctor data
        const userData = await userModel.findById(userId).select("-password");
        const docData = await doctorModel.findById(slot.doctorId).select("-password");

        if (!userData || !docData) {
            // Rollback token assignment
            await availabilitySlotModel.findByIdAndUpdate(slotId, { $inc: { totalTokens: -1 } });
            return res.json({ success: false, message: "User or Doctor not found" });
        }

        // Use auto-calculated travelTime, fallback to 15 minutes
        const finalTravelTime = travelTime ? parseInt(travelTime) : 15;

        // Create appointment
        const appointmentData = {
            userId,
            docId: slot.doctorId,
            slotId: slotId.toString(),
            slotDate: slot.date,
            slotTime: slot.startTime, // Keep for backward compatibility
            slotPeriod: slot.slotPeriod,
            slotTokenIndex: assignedTokenIndex,
            estimatedStart,
            status: 'BOOKED',
            userData,
            docData,
            amount: docData.fees,
            date: Date.now(),
            travelTime: finalTravelTime,
            // Legacy fields
            tokenNumber: assignedTokenIndex,
            estimatedWaitTime: Math.round((estimatedStart - Date.now()) / (1000 * 60))
        };

        const newAppointment = new appointmentModel(appointmentData);
        await newAppointment.save();

        // Schedule notifications
        const { scheduleNotifications } = await import('../services/notificationService.js');
        await scheduleNotifications(newAppointment._id.toString());

        // Emit socket event for real-time update
        const { emitSlotUpdate } = await import('../socket.js');
        if (emitSlotUpdate) {
            emitSlotUpdate(slotId.toString(), {
                slotId: slotId.toString(),
                date: slot.date,
                startTime: slot.startTime,
                endTime: slot.endTime,
                currentToken: slot.currentToken,
                totalTokens: updatedSlot.totalTokens,
                averageConsultationTime: slot.averageConsultationTime
            });
        }

        res.json({
            success: true,
            message: "Token booked successfully",
            appointment: {
                _id: newAppointment._id,
                slotTokenIndex: assignedTokenIndex,
                estimatedStart,
                slotPeriod: slot.slotPeriod
            }
        });
    } catch (error) {
        console.error('Error booking token:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get user's appointments with slot information
 */
export const getUserAppointments = async (req, res) => {
    try {
        const { userId } = req.body; // Set by authUser middleware

        const appointments = await appointmentModel.find({
            userId,
            status: { $ne: 'CANCELLED' }
        }).sort({ slotDate: 1, estimatedStart: 1 });

        // Populate slot information
        const appointmentsWithSlots = await Promise.all(
            appointments.map(async (apt) => {
                let slot = null;
                if (apt.slotId) {
                    slot = await availabilitySlotModel.findById(apt.slotId);
                }

                return {
                    ...apt.toObject(),
                    slot: slot ? {
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        slotPeriod: slot.slotPeriod,
                        currentToken: slot.currentToken,
                        averageConsultationTime: slot.averageConsultationTime
                    } : null
                };
            })
        );

        res.json({
            success: true,
            appointments: appointmentsWithSlots
        });
    } catch (error) {
        console.error('Error getting user appointments:', error);
        res.json({ success: false, message: error.message });
    }
};

