import cron from 'node-cron';
import appointmentModel from '../models/appointmentModel.js';
import doctorModel from '../models/doctorModel.js';
import { sendNotification, calculateNotificationTime } from '../services/notificationService.js';

/**
 * Background job to check and send scheduled notifications
 * Runs every minute to check for pending notifications
 */
const checkAndSendNotifications = async () => {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

        // Get all pending appointments for today
        const appointments = await appointmentModel.find({
            slotDate: today,
            cancelled: false,
            isCompleted: false
        });

        for (const appointment of appointments) {
            const doctor = await doctorModel.findById(appointment.docId);
            if (!doctor) continue;

            // Use appointment's slotDate for queue status lookup
            const appointmentDate = appointment.slotDate || today;
            const queueStatus = doctor.queueStatus[appointmentDate] || { currentToken: 0 };
            const currentToken = queueStatus.currentToken || 0;
            const avgTime = doctor.averageDiagnosisTime || 10;
            const tokenNumber = appointment.tokenNumber;
            // Use auto-calculated travelTime, fallback to 15 minutes if missing
            const travelTime = appointment.travelTime || 15;

            if (!tokenNumber || tokenNumber <= currentToken) {
                continue; // Token already processed
            }

            // Calculate notification times
            const { totalWaitTime, notificationTime } = calculateNotificationTime(
                tokenNumber,
                currentToken,
                avgTime,
                travelTime
            );

            const elapsedTime = (now.getTime() - new Date(appointment.date).getTime()) / (1000 * 60);
            const remainingWaitTime = totalWaitTime - elapsedTime;

            // Calculate fireAfter: totalWait - travelTime - 15 minutes buffer
            const fireAfter = totalWaitTime - travelTime - 15;

            // If fireAfter <= 0, send notification immediately
            if (fireAfter <= 0 && !appointment.notificationSent?.earlyWarning) {
                await sendNotification(appointment._id.toString(), 'earlyWarning');
            }

            // Send early warning (15 minutes before travel time)
            if (!appointment.notificationSent?.earlyWarning && 
                remainingWaitTime <= (travelTime + 15) && 
                remainingWaitTime > (travelTime + 10)) {
                await sendNotification(appointment._id.toString(), 'earlyWarning');
            }

            // Send approaching notification (5 minutes before travel time)
            if (!appointment.notificationSent?.approaching && 
                remainingWaitTime <= (travelTime + 5) && 
                remainingWaitTime > travelTime) {
                await sendNotification(appointment._id.toString(), 'approaching');
            }

            // Send "your turn" notification (when token is next)
            if (!appointment.notificationSent?.yourTurn && 
                tokenNumber === currentToken + 1) {
                await sendNotification(appointment._id.toString(), 'yourTurn');
            }
        }
    } catch (error) {
        console.error('Error in notification job:', error);
    }
};

/**
 * Start the notification cron job
 * Runs every minute
 */
export const startNotificationJob = () => {
    // Run every minute
    cron.schedule('* * * * *', () => {
        console.log('Running notification check...');
        checkAndSendNotifications();
    });

    console.log('Notification job started - checking every minute');
};





