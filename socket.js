import { Server } from 'socket.io';

let io = null;
let socketServer = null;

/**
 * Initialize Socket.IO server
 */
export const initializeSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // In production, specify allowed origins
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);

        // Join slot room
        socket.on('join:slot', (slotId) => {
            const room = `slot_${slotId}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined room: ${room}`);
        });

        // Leave slot room
        socket.on('leave:slot', (slotId) => {
            const room = `slot_${slotId}`;
            socket.leave(room);
            console.log(`Socket ${socket.id} left room: ${room}`);
        });

        // Subscribe to queue updates for an appointment
        socket.on('subscribe_queue', (data) => {
            const { appointmentId, slotId } = data;
            if (slotId) {
                const room = `slot_${slotId}`;
                socket.join(room);
                console.log(`Socket ${socket.id} subscribed to queue for slot ${slotId}`);
            }
            if (appointmentId) {
                const room = `appointment_${appointmentId}`;
                socket.join(room);
                console.log(`Socket ${socket.id} subscribed to queue for appointment ${appointmentId}`);
            }
        });

        // Subscribe to notifications
        socket.on('subscribe_notifications', (data) => {
            const { userId } = data;
            if (userId) {
                handleNotificationSubscription(socket, userId);
            }
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
        });
    });

    socketServer = io;
    console.log('Socket.IO server initialized');
    return io;
};

/**
 * Emit slot update to all clients in the slot room
 */
export const emitSlotUpdate = (slotId, queueSnapshot) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    const room = `slot_${slotId}`;
    io.to(room).emit('slot:update', queueSnapshot);
    console.log(`Emitted slot:update to room ${room}`);
};

/**
 * Emit appointment completed event
 */
export const emitAppointmentCompleted = (slotId, appointmentId, tokenIndex) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    const room = `slot_${slotId}`;
    io.to(room).emit('appointment:completed', {
        slotId,
        appointmentId,
        tokenIndex
    });
    console.log(`Emitted appointment:completed to room ${room}`);
};

/**
 * Emit new booking event
 */
export const emitSlotBooked = (slotId, appointmentId, tokenIndex) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    const room = `slot_${slotId}`;
    io.to(room).emit('slot:booked', {
        slotId,
        appointmentId,
        tokenIndex
    });
    console.log(`Emitted slot:booked to room ${room}`);
};

/**
 * Emit appointment cancelled event
 */
export const emitAppointmentCancelled = (slotId, appointmentId, tokenIndex) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    const room = `slot_${slotId}`;
    io.to(room).emit('appointment:cancelled', {
        slotId,
        appointmentId,
        tokenIndex
    });
    console.log(`Emitted appointment:cancelled to room ${room}`);
};

/**
 * Emit queue update for a specific appointment with full payload
 */
export const emitQueueUpdate = (appointmentId, slotId, queueData, affectedAppointmentIds = null) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    // Use provided lastUpdatedAt or generate new one
    const lastUpdatedAt = queueData.lastUpdatedAt || new Date().toISOString();
    const updateData = {
        type: 'queue_update',
        appointmentId,
        queueId: slotId,
        currentToken: queueData.currentToken,
        servingAppointmentId: queueData.servingAppointmentId || null,
        yourTokenNumber: queueData.yourTokenNumber,
        positionInQueue: queueData.positionInQueue,
        estimatedWaitMin: queueData.estimatedWaitMin,
        averageServiceTimePerPatient: queueData.averageServiceTimePerPatient || null,
        lastUpdatedAt,
        ...(queueData.positionInQueueMap && { positionInQueueMap: queueData.positionInQueueMap }),
        ...(affectedAppointmentIds && { affectedAppointmentIds })
    };

    // Emit to specific appointment room
    if (appointmentId) {
        const appointmentRoom = `appointment_${appointmentId}`;
        io.to(appointmentRoom).emit('queue_update', updateData);
        console.log(`Emitted queue_update to appointment room ${appointmentRoom}`);
    }

    // Emit to slot room (for all appointments in the slot)
    if (slotId) {
        const slotRoom = `slot_${slotId}`;
        io.to(slotRoom).emit('queue_update', updateData);
        console.log(`Emitted queue_update to slot room ${slotRoom}`);
    }

    // Emit to global queue_updates channel for any listeners
    io.emit('queue_update', updateData);
    console.log(`Emitted queue_update globally for appointment ${appointmentId}`);
};

/**
 * Emit minimal queue update (client should fetch full state)
 */
export const emitQueueUpdateMinimal = (appointmentId, slotId) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    const updateData = {
        type: 'queue_update_minimal',
        appointmentId,
        lastUpdatedAt: new Date().toISOString()
    };

    if (appointmentId) {
        const appointmentRoom = `appointment_${appointmentId}`;
        io.to(appointmentRoom).emit('queue_update', updateData);
    }

    if (slotId) {
        const slotRoom = `slot_${slotId}`;
        io.to(slotRoom).emit('queue_update', updateData);
    }

    io.emit('queue_update', updateData);
    console.log(`Emitted queue_update_minimal for appointment ${appointmentId}`);
};

/**
 * Emit notification to a specific user
 */
export const emitNotification = (userId, notificationData) => {
    if (!io) {
        console.warn('Socket.IO not initialized');
        return;
    }

    const userRoom = `user_${userId}`;
    io.to(userRoom).emit('notification', notificationData);
    console.log(`Emitted notification to user ${userId}`);
};

/**
 * Handle user subscribing to notifications
 */
export const handleNotificationSubscription = (socket, userId) => {
    const userRoom = `user_${userId}`;
    socket.join(userRoom);
    console.log(`Socket ${socket.id} joined notification room: ${userRoom}`);
};

export { io, socketServer };
