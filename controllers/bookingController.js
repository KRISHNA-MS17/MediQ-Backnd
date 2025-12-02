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

        // Calculate estimated wait time: (tokenNumber - currentToken) × averageTime
        const estimatedWaitTime = (assignedTokenIndex - slot.currentToken) * slot.averageConsultationTime;

        // Format estimated time as HH:MM (e.g., "10:00", "10:30")
        const estimatedTimeDate = new Date(estimatedStart);
        const estimatedTimeFormatted = estimatedTimeDate.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });

        const newAppointment = new appointmentModel(appointmentData);
        await newAppointment.save();

        // Schedule notifications
        const { scheduleNotifications } = await import('../services/notificationService.js');
        await scheduleNotifications(newAppointment._id.toString());

        // Create notification for appointment booking
        const { createNotification } = await import('../controllers/notificationController.js');
        await createNotification(
            userId,
            'appointment_booked',
            'Appointment Booked',
            `You booked an appointment with ${docData.name} (${docData.speciality}). Token: #${assignedTokenIndex}. Estimated time: ${estimatedTimeFormatted}`,
            newAppointment._id.toString()
        );

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
                tokenNumber: assignedTokenIndex, // For backward compatibility
                estimatedStart,
                estimatedTime: estimatedTimeFormatted, // Formatted time string (e.g., "10:00", "10:30")
                estimatedWaitTime: Math.max(0, estimatedWaitTime), // Ensure non-negative
                slotPeriod: slot.slotPeriod,
                currentToken: slot.currentToken,
                averageConsultationTime: slot.averageConsultationTime,
                amount: docData.fees
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

/**
 * Get queue information for a specific appointment
 */
export const getAppointmentQueue = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { userId } = req.body; // From authUser middleware

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        // Verify appointment belongs to user
        if (appointment.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized access" });
        }

        // Get slot information
        let slot = null;
        if (appointment.slotId) {
            slot = await availabilitySlotModel.findById(appointment.slotId);
        }

        if (!slot) {
            return res.json({ success: false, message: "Slot information not found" });
        }

        const yourTokenNumber = appointment.slotTokenIndex || appointment.tokenNumber;
        const currentToken = slot.currentToken || 0;
        const positionInQueue = Math.max(0, yourTokenNumber - currentToken);
        const averageServiceTimePerPatient = slot.averageConsultationTime || 8;
        const estimatedWaitMin = positionInQueue * averageServiceTimePerPatient;

        res.json({
            success: true,
            data: {
                currentToken,
                yourTokenNumber,
                positionInQueue,
                estimatedWaitMin: Math.round(estimatedWaitMin),
                averageServiceTimePerPatient,
                lastUpdatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting appointment queue:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Cancel an appointment
 */
export const cancelAppointment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { userId } = req.body; // From authUser middleware

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        // Verify appointment belongs to user
        if (appointment.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized access" });
        }

        // Check if already cancelled
        if (appointment.cancelled || appointment.status === 'CANCELLED') {
            return res.json({ success: false, message: "Appointment already cancelled" });
        }

        // Check if already completed
        if (appointment.isCompleted || appointment.status === 'COMPLETED') {
            return res.json({ success: false, message: "Cannot cancel completed appointment" });
        }

        // Check cancellation window (2 hours before appointment)
        const appointmentDate = new Date(appointment.slotDate || appointment.estimatedStart);
        const now = new Date();
        const hoursUntilAppointment = (appointmentDate - now) / (1000 * 60 * 60);

        if (hoursUntilAppointment < 2) {
            return res.json({ 
                success: false, 
                message: "Appointments cannot be cancelled within 2 hours of scheduled time" 
            });
        }

        // Update appointment
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            cancelled: true,
            status: 'CANCELLED'
        });

        // Emit socket event for real-time update
        const { emitSlotUpdate } = await import('../socket.js');
        if (emitSlotUpdate && appointment.slotId) {
            emitSlotUpdate(appointment.slotId.toString(), {
                slotId: appointment.slotId.toString(),
                cancelled: true
            });
        }

        res.json({
            success: true,
            message: "Appointment cancelled successfully"
        });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Process payment for an appointment
 */
export const processPayment = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { userId } = req.body; // From authUser middleware
        const { paymentId, paymentMethod } = req.body;

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        // Verify appointment belongs to user
        if (appointment.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized access" });
        }

        // Check if already paid
        if (appointment.payment || appointment.status === 'PAID') {
            return res.json({ success: false, message: "Appointment already paid" });
        }

        // Update appointment payment status
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            payment: true,
            paymentId: paymentId || null,
            paymentMethod: paymentMethod || 'online',
            paymentDate: Date.now()
        });

        res.json({
            success: true,
            message: "Payment processed successfully"
        });
    } catch (error) {
        console.error('Error processing payment:', error);
        res.json({ success: false, message: error.message });
    }
};
