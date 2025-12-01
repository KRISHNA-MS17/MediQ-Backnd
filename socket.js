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

export { io, socketServer };


