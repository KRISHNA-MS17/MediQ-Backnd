import appointmentModel from '../models/appointmentModel.js';
import doctorModel from '../models/doctorModel.js';
import userModel from '../models/userModel.js';

/**
 * Calculate notification timing based on:
 * - Token number
 * - Current token
 * - Average diagnosis time
 * - Patient travel time
 * - 15-minute early warning buffer
 */
export const calculateNotificationTime = (tokenNumber, currentToken, avgTime, travelTime) => {
    // Calculate total waiting time
    const totalWaitTime = (tokenNumber - currentToken) * avgTime;
    
    // Calculate when to send notification
    // Notification time = total_wait - travel_time - 15_minutes_buffer
    const notificationTime = totalWaitTime - travelTime - 15;
    
    return {
        totalWaitTime,
        notificationTime: Math.max(0, notificationTime), // Ensure non-negative
        shouldNotify: notificationTime >= 0
    };
};

/**
 * Schedule notifications for an appointment
 * Updated for slot-based system using estimatedStart
 */
export const scheduleNotifications = async (appointmentId) => {
    try {
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment || appointment.cancelled || appointment.isCompleted) {
            return;
        }

        // Slot-based notification calculation
        if (appointment.slotId && appointment.estimatedStart) {
            const travelTime = appointment.travelTime || 15;
            const priorBuffer = 15; // minutes
            
            const now = Date.now();
            const estimatedStart = appointment.estimatedStart;
            const timeUntilStart = (estimatedStart - now) / (1000 * 60); // minutes
            
            // Early Warning: estimatedStart - travelTime - 15 minutes
            const earlyWarningTime = timeUntilStart - travelTime - priorBuffer;
            
            // Approaching: estimatedStart - travelTime - 5 minutes
            const approachingTime = timeUntilStart - travelTime - 5;
            
            // Your Turn: when currentToken == userToken - 1 (handled separately)
            
            // Update estimated wait time
            await appointmentModel.findByIdAndUpdate(appointmentId, {
                estimatedWaitTime: Math.max(0, Math.round(timeUntilStart))
            });

            return {
                earlyWarning: {
                    time: Math.max(0, earlyWarningTime),
                    sent: false
                },
                approaching: {
                    time: Math.max(0, approachingTime),
                    sent: false
                },
                yourTurn: {
                    time: null, // Handled by queue movement
                    sent: false
                }
            };
        }

        // Legacy token-based calculation (for backward compatibility)
        const doctor = await doctorModel.findById(appointment.docId);
        if (!doctor) return;

        const { tokenNumber, travelTime, slotDate } = appointment;
        const avgTime = doctor.averageDiagnosisTime || 10;
        
        // Get current token for the day
        const queueStatus = doctor.queueStatus[slotDate] || { currentToken: 0 };
        const currentToken = queueStatus.currentToken || 0;

        if (!tokenNumber || tokenNumber <= currentToken) {
            // Token is already being processed or passed
            return;
        }

        // Use auto-calculated travelTime, fallback to 15 minutes if missing
        const finalTravelTime = travelTime || 15;

        const { totalWaitTime, notificationTime, shouldNotify } = 
            calculateNotificationTime(tokenNumber, currentToken, avgTime, finalTravelTime);

        // Update estimated wait time
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            estimatedWaitTime: totalWaitTime
        });

        if (!shouldNotify) {
            return; // Too early to notify
        }

        // Schedule notifications (this will be handled by a cron job)
        const notificationSchedule = {
            earlyWarning: {
                time: notificationTime,
                sent: false
            },
            approaching: {
                time: totalWaitTime - finalTravelTime - 5, // 5 minutes before arrival
                sent: false
            },
            yourTurn: {
                time: totalWaitTime - 2, // 2 minutes before turn
                sent: false
            }
        };

        return notificationSchedule;
    } catch (error) {
        console.error('Error scheduling notifications:', error);
        return null;
    }
};

/**
 * Send push notification (placeholder - integrate with your push service)
 */
export const sendPushNotification = async (userId, title, message) => {
    try {
        const user = await userModel.findById(userId);
        if (!user) return;

        // TODO: Integrate with your push notification service
        // Example: Firebase Cloud Messaging, OneSignal, etc.
        console.log(`Push Notification to ${user.email}: ${title} - ${message}`);
        
        // Placeholder for actual push notification implementation
        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        return false;
    }
};

/**
 * Send SMS notification (placeholder - integrate with Twilio)
 */
export const sendSMS = async (phoneNumber, message) => {
    try {
        // TODO: Integrate with Twilio API
        // const twilio = require('twilio');
        // const client = twilio(accountSid, authToken);
        // await client.messages.create({
        //     body: message,
        //     to: phoneNumber,
        //     from: process.env.TWILIO_PHONE_NUMBER
        // });

        console.log(`SMS to ${phoneNumber}: ${message}`);
        return true;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return false;
    }
};

/**
 * Send notification to patient
 */
export const sendNotification = async (appointmentId, type) => {
    try {
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) return;

        const user = await userModel.findById(appointment.userId);
        if (!user) return;

        const doctor = await doctorModel.findById(appointment.docId);
        if (!doctor) return;

        let title, message;

        switch (type) {
            case 'earlyWarning':
                title = 'Appointment Reminder';
                message = `Your appointment with Dr. ${doctor.name} is approaching. Token #${appointment.tokenNumber}. Please start preparing to leave.`;
                break;
            case 'approaching':
                title = 'Time to Leave';
                message = `Please leave now for your appointment with Dr. ${doctor.name}. Token #${appointment.tokenNumber}. Estimated arrival time: ${appointment.travelTime} minutes.`;
                break;
            case 'yourTurn':
                title = 'Your Turn is Coming';
                message = `Token #${appointment.tokenNumber} will be called soon. Please be ready at the clinic.`;
                break;
            default:
                return;
        }

        // Send push notification
        await sendPushNotification(appointment.userId, title, message);

        // Send SMS if phone number is available
        if (user.phone && user.phone !== '000000000') {
            await sendSMS(user.phone, `${title}: ${message}`);
        }

        // Update notification status
        const updateField = `notificationSent.${type}`;
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            [updateField]: true
        });

        return true;
    } catch (error) {
        console.error('Error sending notification:', error);
        return false;
    }
};





