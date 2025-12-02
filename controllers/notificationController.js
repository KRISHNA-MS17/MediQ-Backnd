import appointmentModel from '../models/appointmentModel.js';
import notificationModel from '../models/notificationModel.js';

/**
 * Subscribe to notifications for an appointment
 */
export const subscribeNotifications = async (req, res) => {
    try {
        const { appointmentId, notifyWhenTokensAway, deviceToken } = req.body;
        const { userId } = req.body; // From authUser middleware

        if (!appointmentId) {
            return res.json({ success: false, message: "Appointment ID is required" });
        }

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        // Verify appointment belongs to user
        if (appointment.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized access" });
        }

        // Store notification preferences
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            $set: {
                notificationSubscription: {
                    subscribed: true,
                    notifyWhenTokensAway: notifyWhenTokensAway || 2,
                    deviceToken: deviceToken || null,
                    subscribedAt: Date.now()
                }
            }
        });

        res.json({
            success: true,
            message: "Notification subscription enabled",
            subscriptionId: appointmentId
        });
    } catch (error) {
        console.error('Error subscribing to notifications:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Unsubscribe from notifications for an appointment
 */
export const unsubscribeNotifications = async (req, res) => {
    try {
        const { appointmentId } = req.body;
        const { userId } = req.body; // From authUser middleware

        if (!appointmentId) {
            return res.json({ success: false, message: "Appointment ID is required" });
        }

        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        // Verify appointment belongs to user
        if (appointment.userId !== userId) {
            return res.json({ success: false, message: "Unauthorized access" });
        }

        // Remove notification subscription
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            $set: {
                notificationSubscription: {
                    subscribed: false,
                    notifyWhenTokensAway: null,
                    deviceToken: null,
                    unsubscribedAt: Date.now()
                }
            }
        });

        res.json({
            success: true,
            message: "Notification subscription disabled"
        });
    } catch (error) {
        console.error('Error unsubscribing from notifications:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get all notifications for a user
 */
export const getNotifications = async (req, res) => {
    try {
        const { userId } = req.body; // From authUser middleware

        const notifications = await notificationModel.find({ userId })
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({
            success: true,
            notifications: notifications.map(notif => ({
                _id: notif._id,
                type: notif.type,
                title: notif.title,
                message: notif.message,
                appointmentId: notif.appointmentId,
                read: notif.read,
                createdAt: new Date(notif.createdAt).toISOString(),
                date: new Date(notif.createdAt).toISOString(), // For backward compatibility
            }))
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get unread notification count
 */
export const getUnreadCount = async (req, res) => {
    try {
        const { userId } = req.body; // From authUser middleware

        const count = await notificationModel.countDocuments({
            userId,
            read: false
        });

        res.json({
            success: true,
            count
        });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.json({ success: false, message: error.message, count: 0 });
    }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const { userId } = req.body; // From authUser middleware

        const notification = await notificationModel.findOne({
            _id: notificationId,
            userId
        });

        if (!notification) {
            return res.json({ success: false, message: "Notification not found" });
        }

        await notificationModel.findByIdAndUpdate(notificationId, {
            read: true
        });

        res.json({
            success: true,
            message: "Notification marked as read"
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Create a notification (helper function)
 */
export const createNotification = async (userId, type, title, message, appointmentId = null) => {
    try {
        const notification = new notificationModel({
            userId,
            type,
            title,
            message,
            appointmentId,
            read: false,
            createdAt: Date.now(),
            date: new Date().toISOString()
        });
        await notification.save();

        // Emit socket event
        const { emitNotification } = await import('../socket.js');
        if (emitNotification) {
            emitNotification(userId, {
                _id: notification._id.toString(),
                type,
                title,
                message,
                appointmentId,
                read: false,
                createdAt: new Date(notification.createdAt).toISOString(),
            });
        }

        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
};
