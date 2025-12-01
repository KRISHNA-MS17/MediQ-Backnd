import availabilitySlotModel from '../models/availabilitySlotModel.js';
import appointmentModel from '../models/appointmentModel.js';
import doctorModel from '../models/doctorModel.js';

/**
 * Mark a token as completed in a slot
 * Updates average time using EMA (alpha = 0.2)
 * Recalculates estimated start times for remaining tokens
 * Emits socket event with updated queue snapshot
 */
export const markTokenCompleted = async (req, res) => {
    try {
        const { appointmentId, actualDuration } = req.body;

        if (!appointmentId) {
            return res.json({ success: false, message: "Appointment ID required" });
        }

        // Get appointment
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        if (!appointment.slotId) {
            return res.json({ success: false, message: "This appointment is not slot-based" });
        }

        // Get slot
        const slot = await availabilitySlotModel.findById(appointment.slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        // Verify this is the current token
        if (appointment.slotTokenIndex !== slot.currentToken + 1) {
            return res.json({ 
                success: false, 
                message: `Token mismatch. Current token is ${slot.currentToken + 1}, but appointment token is ${appointment.slotTokenIndex}` 
            });
        }

        // Calculate actual duration if not provided
        let finalActualDuration = actualDuration;
        if (!finalActualDuration && appointment.estimatedStart) {
            // Calculate from estimated start to now
            finalActualDuration = Math.round((Date.now() - appointment.estimatedStart) / (1000 * 60));
        }
        if (!finalActualDuration || finalActualDuration <= 0) {
            finalActualDuration = slot.averageConsultationTime; // Fallback to current average
        }

        // Update average consultation time using EMA (alpha = 0.2)
        const alpha = 0.2;
        const oldAvg = slot.averageConsultationTime;
        const newAvg = alpha * finalActualDuration + (1 - alpha) * oldAvg;

        // Update slot: increment currentToken, update average, increment consultationsCount
        slot.currentToken = slot.currentToken + 1;
        slot.averageConsultationTime = Math.round(newAvg * 10) / 10; // Round to 1 decimal
        slot.consultationsCount = slot.consultationsCount + 1;
        slot.updatedAt = Date.now();
        await slot.save();

        // Update appointment: mark as completed, record actual duration
        appointment.status = 'COMPLETED';
        appointment.actualConsultDuration = finalActualDuration;
        appointment.isCompleted = true;
        await appointment.save();

        // Recalculate estimated start times for all remaining tokens in this slot
        const remainingAppointments = await appointmentModel.find({
            slotId: appointment.slotId.toString(),
            slotTokenIndex: { $gt: slot.currentToken },
            status: { $in: ['BOOKED', 'IN_PROGRESS'] }
        }).sort({ slotTokenIndex: 1 });

        const slotStart = new Date(`${slot.date}T${slot.startTime}:00`);
        
        for (const apt of remainingAppointments) {
            const estimatedMinutes = (apt.slotTokenIndex - 1) * slot.averageConsultationTime;
            apt.estimatedStart = slotStart.getTime() + (estimatedMinutes * 60 * 1000);
            apt.estimatedWaitTime = Math.round((apt.estimatedStart - Date.now()) / (1000 * 60));
            await apt.save();

            // Reschedule notifications with new estimated start
            const { scheduleNotifications } = await import('../services/notificationService.js');
            await scheduleNotifications(apt._id.toString());
        }

        // Mark next token as IN_PROGRESS if exists
        const nextAppointment = await appointmentModel.findOne({
            slotId: appointment.slotId.toString(),
            slotTokenIndex: slot.currentToken,
            status: 'BOOKED'
        });

        if (nextAppointment) {
            nextAppointment.status = 'IN_PROGRESS';
            await nextAppointment.save();

            // Send "your turn" notification
            const { sendNotification } = await import('../services/notificationService.js');
            await sendNotification(nextAppointment._id.toString(), 'yourTurn');
        }

        // Build queue snapshot for socket broadcast
        const allAppointments = await appointmentModel.find({
            slotId: appointment.slotId.toString(),
            status: { $ne: 'CANCELLED' }
        }).sort({ slotTokenIndex: 1 });

        const tokens = allAppointments.map(apt => ({
            index: apt.slotTokenIndex,
            status: apt.status,
            estimatedStart: apt.estimatedStart,
            appointmentId: apt._id.toString(),
            userId: apt.userId
        }));

        // Fill in available tokens up to totalTokens + 5
        const maxTokens = Math.max(slot.totalTokens, tokens.length, 5);
        for (let i = tokens.length + 1; i <= maxTokens; i++) {
            const estimatedMinutes = (i - 1) * slot.averageConsultationTime;
            const estimatedStart = slotStart.getTime() + (estimatedMinutes * 60 * 1000);
            tokens.push({
                index: i,
                status: 'AVAILABLE',
                estimatedStart,
                appointmentId: null,
                userId: null
            });
        }

        const queueSnapshot = {
            slotId: slot._id.toString(),
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            currentToken: slot.currentToken,
            totalTokens: slot.totalTokens,
            averageConsultationTime: slot.averageConsultationTime,
            tokens
        };

        // Emit socket event
        const { emitSlotUpdate } = await import('../socket.js');
        if (emitSlotUpdate) {
            emitSlotUpdate(slot._id.toString(), queueSnapshot);
        }

        res.json({
            success: true,
            message: "Token marked as completed",
            queueSnapshot
        });
    } catch (error) {
        console.error('Error marking token completed:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get queue snapshot for a slot
 */
export const getSlotQueue = async (req, res) => {
    try {
        const { slotId } = req.params;

        const slot = await availabilitySlotModel.findById(slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        const appointments = await appointmentModel.find({
            slotId: slotId.toString(),
            status: { $ne: 'CANCELLED' }
        }).sort({ slotTokenIndex: 1 });

        const slotStart = new Date(`${slot.date}T${slot.startTime}:00`);
        const tokens = [];

        const maxTokens = Math.max(slot.totalTokens, appointments.length, 5);

        for (let i = 1; i <= maxTokens; i++) {
            const appointment = appointments.find(apt => apt.slotTokenIndex === i);
            let status = 'AVAILABLE';
            let estimatedStart = null;

            if (appointment) {
                status = appointment.status;
                estimatedStart = appointment.estimatedStart;
            } else {
                const estimatedMinutes = (i - 1) * slot.averageConsultationTime;
                estimatedStart = slotStart.getTime() + (estimatedMinutes * 60 * 1000);
            }

            tokens.push({
                index: i,
                status,
                estimatedStart,
                appointmentId: appointment?._id?.toString() || null,
                userId: appointment?.userId || null
            });
        }

        res.json({
            success: true,
            queueSnapshot: {
                slotId: slot._id.toString(),
                date: slot.date,
                startTime: slot.startTime,
                endTime: slot.endTime,
                currentToken: slot.currentToken,
                totalTokens: slot.totalTokens,
                averageConsultationTime: slot.averageConsultationTime,
                tokens
            }
        });
    } catch (error) {
        console.error('Error getting slot queue:', error);
        res.json({ success: false, message: error.message });
    }
};


