import express from 'express';
import { 
    subscribeNotifications, 
    unsubscribeNotifications,
    getNotifications,
    getUnreadCount,
    markAsRead
} from '../controllers/notificationController.js';
import authUser from '../middlewares/authUser.js';

const notificationRouter = express.Router();

// Subscribe to notifications
notificationRouter.post('/subscribe', authUser, subscribeNotifications);

// Unsubscribe from notifications
notificationRouter.post('/unsubscribe', authUser, unsubscribeNotifications);

// Get all notifications
notificationRouter.get('/', authUser, getNotifications);

// Get unread count
notificationRouter.get('/unread-count', authUser, getUnreadCount);

// Mark notification as read
notificationRouter.post('/:notificationId/read', authUser, markAsRead);

export default notificationRouter;
