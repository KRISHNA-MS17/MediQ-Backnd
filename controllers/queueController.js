import doctorModel from '../models/doctorModel.js';
import appointmentModel from '../models/appointmentModel.js';
import { scheduleNotifications } from '../services/notificationService.js';

/**
 * Get queue status for a doctor on a specific date
 */
export const getQueueStatus = async (req, res) => {
    try {
        const { docId, date } = req.body;

        if (!docId || !date) {
            return res.json({ success: false, message: "Doctor ID and date are required" });
        }

        const doctor = await doctorModel.findById(docId);
        if (!doctor) {
            return res.json({ success: false, message: "Doctor not found" });
        }

        // Get all appointments for the day
        const appointments = await appointmentModel.find({
            docId,
            slotDate: date,
            cancelled: false,
            isCompleted: false
        }).sort({ tokenNumber: 1 });

        const queueStatus = doctor.queueStatus[date] || { currentToken: 0, totalTokens: 0 };
        const currentToken = queueStatus.currentToken || 0;
        const totalTokens = appointments.length;
        const remainingTokens = Math.max(0, totalTokens - currentToken);

        // Get current patient being treated
        const currentAppointment = appointments.find(apt => apt.tokenNumber === currentToken);

        res.json({
            success: true,
            queueData: {
                currentToken,
                totalTokens,
                remainingTokens,
                averageDiagnosisTime: doctor.averageDiagnosisTime || 10,
                currentPatient: currentAppointment ? {
                    name: currentAppointment.userData.name,
                    tokenNumber: currentAppointment.tokenNumber
                } : null,
                upcomingTokens: appointments
                    .filter(apt => apt.tokenNumber > currentToken)
                    .slice(0, 5)
                    .map(apt => ({
                        tokenNumber: apt.tokenNumber,
                        patientName: apt.userData.name,
                        estimatedTime: (apt.tokenNumber - currentToken) * (doctor.averageDiagnosisTime || 10)
                    }))
            }
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Update queue - Mark current token as completed and move to next
 */
export const updateQueue = async (req, res) => {
    try {
        const { docId, date } = req.body;

        if (!docId || !date) {
            return res.json({ success: false, message: "Doctor ID and date are required" });
        }

        const doctor = await doctorModel.findById(docId);
        if (!doctor) {
            return res.json({ success: false, message: "Doctor not found" });
        }

        // Get current queue status
        const queueStatus = doctor.queueStatus[date] || { currentToken: 0, totalTokens: 0 };
        const currentToken = queueStatus.currentToken || 0;

        // Find current appointment
        const currentAppointment = await appointmentModel.findOne({
            docId,
            slotDate: date,
            tokenNumber: currentToken,
            cancelled: false,
            isCompleted: false
        });

        if (currentAppointment) {
            // Mark current appointment as completed
            await appointmentModel.findByIdAndUpdate(currentAppointment._id, {
                isCompleted: true
            });
        }

        // Move to next token
        const nextToken = currentToken + 1;
        
        // Update doctor's queue status
        const updatedQueueStatus = {
            ...doctor.queueStatus,
            [date]: {
                currentToken: nextToken,
                totalTokens: queueStatus.totalTokens
            }
        };

        await doctorModel.findByIdAndUpdate(docId, {
            queueStatus: updatedQueueStatus,
            currentToken: nextToken
        });

        // Find next appointment and send notification
        const nextAppointment = await appointmentModel.findOne({
            docId,
            slotDate: date,
            tokenNumber: nextToken,
            cancelled: false,
            isCompleted: false
        });

        if (nextAppointment) {
            // Send "your turn" notification to next patient
            const { sendNotification } = await import('../services/notificationService.js');
            await sendNotification(nextAppointment._id.toString(), 'yourTurn');
        }

        // Recalculate and reschedule notifications for all pending appointments
        const pendingAppointments = await appointmentModel.find({
            docId,
            slotDate: date,
            tokenNumber: { $gt: nextToken },
            cancelled: false,
            isCompleted: false
        });

        for (const apt of pendingAppointments) {
            await scheduleNotifications(apt._id.toString());
        }

        res.json({
            success: true,
            message: "Queue updated successfully",
            newCurrentToken: nextToken
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Update average diagnosis time
 */
export const updateAverageTime = async (req, res) => {
    try {
        const { docId, averageDiagnosisTime } = req.body;

        if (!docId || !averageDiagnosisTime) {
            return res.json({ success: false, message: "Doctor ID and average time are required" });
        }

        if (averageDiagnosisTime <= 0) {
            return res.json({ success: false, message: "Average time must be greater than 0" });
        }

        await doctorModel.findByIdAndUpdate(docId, {
            averageDiagnosisTime: parseInt(averageDiagnosisTime)
        });

        // Reschedule notifications for all pending appointments
        const today = new Date().toISOString().split('T')[0];
        const pendingAppointments = await appointmentModel.find({
            docId,
            slotDate: today,
            cancelled: false,
            isCompleted: false
        });

        for (const apt of pendingAppointments) {
            await scheduleNotifications(apt._id.toString());
        }

        res.json({ success: true, message: "Average diagnosis time updated" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Update doctor location
 */
export const updateDoctorLocation = async (req, res) => {
    try {
        const { docId, latitude, longitude, address } = req.body;

        if (!docId) {
            return res.json({ success: false, message: "Doctor ID is required" });
        }

        const locationData = {};
        if (latitude !== undefined) locationData['location.latitude'] = parseFloat(latitude);
        if (longitude !== undefined) locationData['location.longitude'] = parseFloat(longitude);
        if (address !== undefined) locationData['location.address'] = address;

        await doctorModel.findByIdAndUpdate(docId, locationData);

        res.json({ success: true, message: "Location updated successfully" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};





