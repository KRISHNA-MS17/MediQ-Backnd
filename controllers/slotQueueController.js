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

        // Verify appointment is currently being served (status must be SERVING)
        if (appointment.status !== 'SERVING') {
            return res.json({ 
                success: false, 
                message: `Appointment is not currently being served. Current status: ${appointment.status}. Only appointments with status 'SERVING' can be completed.` 
            });
        }

        // Verify this is the current serving appointment
        if (slot.servingAppointmentId !== appointmentId.toString()) {
            return res.json({ 
                success: false, 
                message: `This appointment is not the current serving appointment. Current serving: ${slot.servingAppointmentId}` 
            });
        }

        // Calculate service duration
        let serviceDurationSec = null;
        let finalActualDuration = actualDuration;

        if (appointment.servingStartedAt) {
            // Calculate from serving start to now
            const servingEndTime = Date.now();
            serviceDurationSec = Math.round((servingEndTime - appointment.servingStartedAt) / 1000);
            finalActualDuration = Math.round(serviceDurationSec / 60); // Convert to minutes
        } else if (!finalActualDuration && appointment.estimatedStart) {
            // Fallback: Calculate from estimated start to now
            finalActualDuration = Math.round((Date.now() - appointment.estimatedStart) / (1000 * 60));
            serviceDurationSec = finalActualDuration * 60;
        }

        if (!finalActualDuration || finalActualDuration <= 0) {
            finalActualDuration = slot.averageConsultationTime; // Fallback to current average
            serviceDurationSec = finalActualDuration * 60;
        }

        // Update average consultation time using rolling average
        // Method: (totalServiceSeconds / consultationsCount) / 60
        slot.totalServiceSeconds = (slot.totalServiceSeconds || 0) + serviceDurationSec;
        slot.consultationsCount = (slot.consultationsCount || 0) + 1;
        const newAvg = (slot.totalServiceSeconds / slot.consultationsCount) / 60; // Convert to minutes

        // Also support EMA as fallback if consultationsCount is low
        if (slot.consultationsCount < 3) {
            const alpha = 0.2;
            const oldAvg = slot.averageConsultationTime;
            slot.averageConsultationTime = Math.round((alpha * finalActualDuration + (1 - alpha) * oldAvg) * 10) / 10;
        } else {
            slot.averageConsultationTime = Math.round(newAvg * 10) / 10; // Round to 1 decimal
        }

        // Update slot: increment currentToken, update average
        const previousToken = slot.currentToken;
        const completedAt = Date.now();
        slot.updatedAt = completedAt;
        
        // Find next waiting appointment to auto-start
        const nextWaitingAppointment = await appointmentModel.findOne({
            slotId: appointment.slotId.toString(),
            slotTokenIndex: { $gt: slot.currentToken },
            status: { $in: ['BOOKED', 'WAITING'] }
        }).sort({ slotTokenIndex: 1 });

        if (nextWaitingAppointment) {
            // Auto-start next appointment
            slot.currentToken = nextWaitingAppointment.slotTokenIndex;
            slot.servingAppointmentId = nextWaitingAppointment._id.toString();
            
            // Update next appointment to SERVING
            nextWaitingAppointment.status = 'SERVING';
            nextWaitingAppointment.servingStartedAt = completedAt; // Start immediately after previous completed
            await nextWaitingAppointment.save();
        } else {
            // No more waiting appointments - increment token and clear serving
            slot.currentToken = slot.currentToken + 1;
            slot.servingAppointmentId = null;
        }
        
        await slot.save();

        // Update appointment: mark as completed, record service duration
        const servingEndTime = Date.now();
        appointment.status = 'COMPLETED';
        appointment.actualConsultDuration = finalActualDuration;
        appointment.servingEndedAt = servingEndTime;
        appointment.serviceDurationSec = serviceDurationSec;
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

        // Emit socket events
        const { emitSlotUpdate, emitQueueUpdate } = await import('../socket.js');
        if (emitSlotUpdate) {
            emitSlotUpdate(slot._id.toString(), queueSnapshot);
        }

        // Emit queue_update for all appointments in this slot and create notifications
        if (emitQueueUpdate) {
            const { createNotification } = await import('../controllers/notificationController.js');
            
            // Collect all affected appointment IDs
            const affectedAppointmentIds = allAppointments.map(apt => apt._id.toString());
            const lastUpdatedAt = new Date().toISOString();
            
            // Build positionInQueueMap for efficient client updates
            const positionInQueueMap = {};
            for (const apt of allAppointments) {
                const position = Math.max(0, apt.slotTokenIndex - slot.currentToken);
                positionInQueueMap[apt._id.toString()] = position;
            }
            
            // Emit queue_update for each affected appointment with full payload including positionInQueueMap
            for (const apt of allAppointments) {
                const position = positionInQueueMap[apt._id.toString()];
                const estimatedWait = position * slot.averageConsultationTime;
                
                // Emit with full payload including affected appointments, timestamp, and positionInQueueMap
                emitQueueUpdate(
                    apt._id.toString(), 
                    slot._id.toString(), 
                    {
                        currentToken: slot.currentToken,
                        servingAppointmentId: slot.servingAppointmentId,
                        yourTokenNumber: apt.slotTokenIndex,
                        positionInQueue: position,
                        estimatedWaitMin: Math.round(estimatedWait),
                        averageServiceTimePerPatient: slot.averageConsultationTime,
                        lastUpdatedAt,
                        positionInQueueMap // Include map for all clients
                    },
                    affectedAppointmentIds
                );

                // Get previous position for notification logic
                const previousPosition = apt.slotTokenIndex - (slot.currentToken - 1);
                const positionDecreased = position < previousPosition;

                // Create notification for queue position update
                if (position === 0 && positionDecreased) {
                    // It's their turn
                    await createNotification(
                        apt.userId,
                        'your_turn',
                        'Your Turn!',
                        `It's your turn now! Please proceed to the counter.`,
                        apt._id.toString()
                    );
                } else if (position <= 2 && positionDecreased) {
                    // Check if user is subscribed and should be notified
                    const notifyWhen = apt.notificationSubscription?.notifyWhenTokensAway || 2;
                    if (position <= notifyWhen && apt.notificationSubscription?.subscribed) {
                        await createNotification(
                            apt.userId,
                            'queue_update',
                            'Almost Your Turn',
                            `Your position in queue is now ${position}. ${position === 1 ? 'You\'re next!' : `Estimated wait: ${Math.round(estimatedWait)} minutes`}`,
                            apt._id.toString()
                        );
                    }
                }
            }
        }

        // Telemetry
        console.log(`[TELEMETRY] doctor_completed: { appointmentId: ${appointmentId}, doctorId: ${appointment.docId}, durationSec: ${serviceDurationSec} }`);

        res.json({
            success: true,
            message: "Token marked as completed",
            serviceDuration: {
                seconds: serviceDurationSec,
                minutes: finalActualDuration
            },
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
                userId: appointment?.userId || null,
                userData: appointment?.userData || null
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
                servingSessionStarted: slot.servingSessionStarted || false,
                servingAppointmentId: slot.servingAppointmentId,
                averageConsultationTime: slot.averageConsultationTime,
                tokens,
                appointments: appointments.map(apt => ({
                    _id: apt._id.toString(),
                    slotTokenIndex: apt.slotTokenIndex,
                    status: apt.status,
                    userData: apt.userData,
                    estimatedStart: apt.estimatedStart,
                    actualConsultDuration: apt.actualConsultDuration,
                    servingStartedAt: apt.servingStartedAt,
                    createdAt: apt.date
                }))
            }
        });
    } catch (error) {
        console.error('Error getting slot queue:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Mark token as wrong/skip - moves to next token without completing current
 */
export const markTokenWrong = async (req, res) => {
    try {
        const { appointmentId } = req.body;

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

        // Verify appointment is currently being served (if it was)
        if (appointment.status === 'SERVING' && slot.servingAppointmentId !== appointmentId.toString()) {
            return res.json({ 
                success: false, 
                message: `This appointment is not the current serving appointment. Current serving: ${slot.servingAppointmentId}` 
            });
        }

        // Mark appointment as cancelled/wrong
        appointment.status = 'CANCELLED';
        appointment.cancelled = true;
        await appointment.save();

        // If this was the serving appointment, auto-start next
        const now = Date.now();
        if (slot.servingAppointmentId === appointmentId.toString()) {
            // Find next waiting appointment
            const nextWaitingAppointment = await appointmentModel.findOne({
                slotId: appointment.slotId.toString(),
                slotTokenIndex: { $gt: slot.currentToken },
                status: { $in: ['BOOKED', 'WAITING'] }
            }).sort({ slotTokenIndex: 1 });

            if (nextWaitingAppointment) {
                // Auto-start next appointment
                slot.currentToken = nextWaitingAppointment.slotTokenIndex;
                slot.servingAppointmentId = nextWaitingAppointment._id.toString();
                nextWaitingAppointment.status = 'SERVING';
                nextWaitingAppointment.servingStartedAt = now;
                await nextWaitingAppointment.save();
            } else {
                // No more waiting - increment token and clear serving
                slot.currentToken = slot.currentToken + 1;
                slot.servingAppointmentId = null;
            }
        } else {
            // Not the serving appointment, just increment token
            slot.currentToken = slot.currentToken + 1;
        }
        
        slot.updatedAt = now;
        await slot.save();

        // Recalculate estimated start times for all remaining tokens
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

            // Reschedule notifications
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

        // Build queue snapshot
        const allAppointments = await appointmentModel.find({
            slotId: appointment.slotId.toString(),
            status: { $ne: 'CANCELLED' }
        }).sort({ slotTokenIndex: 1 });

        const tokens = allAppointments.map(apt => ({
            index: apt.slotTokenIndex,
            status: apt.status,
            estimatedStart: apt.estimatedStart,
            appointmentId: apt._id.toString(),
            userId: apt.userId,
            userData: apt.userData
        }));

        const maxTokens = Math.max(slot.totalTokens, tokens.length, 5);
        for (let i = tokens.length + 1; i <= maxTokens; i++) {
            const estimatedMinutes = (i - 1) * slot.averageConsultationTime;
            const estimatedStart = slotStart.getTime() + (estimatedMinutes * 60 * 1000);
            tokens.push({
                index: i,
                status: 'AVAILABLE',
                estimatedStart,
                appointmentId: null,
                userId: null,
                userData: null
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

        // Emit socket events
        const { emitSlotUpdate, emitQueueUpdate } = await import('../socket.js');
        if (emitSlotUpdate) {
            emitSlotUpdate(slot._id.toString(), queueSnapshot);
        }

        // Emit queue_update for all appointments in this slot
        if (emitQueueUpdate) {
            for (const apt of allAppointments) {
                const position = Math.max(0, apt.slotTokenIndex - slot.currentToken);
                const estimatedWait = position * slot.averageConsultationTime;
                
                emitQueueUpdate(apt._id.toString(), slot._id.toString(), {
                    currentToken: slot.currentToken,
                    servingAppointmentId: slot.servingAppointmentId,
                    yourTokenNumber: apt.slotTokenIndex,
                    positionInQueue: position,
                    estimatedWaitMin: Math.round(estimatedWait),
                    averageServiceTimePerPatient: slot.averageConsultationTime,
                    lastUpdatedAt: new Date().toISOString()
                });
            }
        }

        res.json({
            success: true,
            message: "Token marked as wrong and skipped",
            queueSnapshot
        });
    } catch (error) {
        console.error('Error marking token wrong:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Start serving an appointment
 * Sets appointment status to SERVING, updates slot currentToken and servingAppointmentId
 * Emits queue_update events and sends notifications
 */
export const startServing = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { startedAt } = req.body;
        const { docId } = req.body; // From authDoctor middleware

        if (!appointmentId) {
            return res.json({ success: false, message: "Appointment ID required" });
        }

        // Get appointment
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            return res.json({ success: false, message: "Appointment not found" });
        }

        // Verify doctor owns this appointment's slot
        if (appointment.docId !== docId) {
            return res.json({ success: false, message: "Unauthorized: This appointment does not belong to you" });
        }

        if (!appointment.slotId) {
            return res.json({ success: false, message: "This appointment is not slot-based" });
        }

        // Get slot
        const slot = await availabilitySlotModel.findById(appointment.slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        // Check if another appointment is currently being served
        if (slot.servingAppointmentId && slot.servingAppointmentId !== appointmentId) {
            const servingAppt = await appointmentModel.findById(slot.servingAppointmentId);
            if (servingAppt && servingAppt.status === 'SERVING') {
                return res.json({ 
                    success: false, 
                    message: `Another appointment (token #${servingAppt.slotTokenIndex}) is currently being served. Please complete it first.` 
                });
            }
        }

        // Verify this is the next token to serve
        const expectedToken = slot.currentToken + 1;
        if (appointment.slotTokenIndex !== expectedToken) {
            return res.json({ 
                success: false, 
                message: `Token mismatch. Expected token #${expectedToken}, but appointment token is #${appointment.slotTokenIndex}` 
            });
        }

        // Set serving state
        const servingStartTime = startedAt ? new Date(startedAt).getTime() : Date.now();
        appointment.status = 'SERVING';
        appointment.servingStartedAt = servingStartTime;
        await appointment.save();

        // Update slot: set currentToken and servingAppointmentId
        slot.currentToken = appointment.slotTokenIndex;
        slot.servingAppointmentId = appointmentId;
        slot.updatedAt = Date.now();
        await slot.save();

        // Get all appointments in this slot for queue update
        const allAppointments = await appointmentModel.find({
            slotId: appointment.slotId.toString(),
            status: { $ne: 'CANCELLED' }
        }).sort({ slotTokenIndex: 1 });

        // Build position map for all affected appointments
        const positionInQueueMap = {};
        const affectedAppointmentIds = [];
        
        for (const apt of allAppointments) {
            const position = Math.max(0, apt.slotTokenIndex - slot.currentToken);
            positionInQueueMap[apt._id.toString()] = position;
            affectedAppointmentIds.push(apt._id.toString());
        }

        // Emit queue_update events
        const { emitQueueUpdate } = await import('../socket.js');
        const { createNotification } = await import('../controllers/notificationController.js');
        const lastUpdatedAt = new Date().toISOString();

        // Emit to all affected appointments
        for (const apt of allAppointments) {
            const position = positionInQueueMap[apt._id.toString()];
            const estimatedWait = position * slot.averageConsultationTime;

            emitQueueUpdate(
                apt._id.toString(),
                slot._id.toString(),
                {
                    currentToken: slot.currentToken,
                    servingAppointmentId: appointmentId,
                    yourTokenNumber: apt.slotTokenIndex,
                    positionInQueue: position,
                    estimatedWaitMin: Math.round(estimatedWait),
                    averageServiceTimePerPatient: slot.averageConsultationTime,
                    lastUpdatedAt,
                    positionInQueueMap
                },
                affectedAppointmentIds
            );

            // Send notifications to waiting patients
            if (apt.status === 'BOOKED' || apt.status === 'WAITING') {
                const notifyWhen = apt.notificationSubscription?.notifyWhenTokensAway || 2;
                
                if (apt.notificationSubscription?.subscribed) {
                    if (position === 0) {
                        // Their turn
                        await createNotification(
                            apt.userId,
                            'now_serving',
                            'Your Turn!',
                            `Your token #${apt.slotTokenIndex} is now being served. Please proceed to the counter.`,
                            apt._id.toString()
                        );
                    } else if (position <= notifyWhen) {
                        // Almost their turn
                        await createNotification(
                            apt.userId,
                            'your_turn_soon',
                            'Almost Your Turn',
                            `Your token #${apt.slotTokenIndex} is ${position} ${position === 1 ? 'token' : 'tokens'} away. Estimated wait: ${Math.round(estimatedWait)} minutes.`,
                            apt._id.toString()
                        );
                    } else {
                        // General position update
                        await createNotification(
                            apt.userId,
                            'position_update',
                            'Queue Update',
                            `Doctor has started serving token #${slot.currentToken}. Your position: ${position}. Estimated wait: ${Math.round(estimatedWait)} min.`,
                            apt._id.toString()
                        );
                    }
                }
            }
        }

        // Telemetry
        console.log(`[TELEMETRY] doctor_start_serving: { appointmentId: ${appointmentId}, doctorId: ${docId}, startedAt: ${servingStartTime} }`);

        res.json({
            success: true,
            message: "Started serving appointment",
            appointment: {
                _id: appointment._id.toString(),
                slotTokenIndex: appointment.slotTokenIndex,
                status: appointment.status,
                servingStartedAt: appointment.servingStartedAt
            },
            queueState: {
                currentToken: slot.currentToken,
                servingAppointmentId: appointmentId,
                averageServiceTimePerPatient: slot.averageConsultationTime,
                lastUpdatedAt
            }
        });
    } catch (error) {
        console.error('Error starting serving:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Start serving session for a queue/slot (one-time operation)
 * Sets servingSessionStarted = true and auto-starts the first waiting appointment
 */
export const startSession = async (req, res) => {
    try {
        const { slotId } = req.params;
        const { doctorId, startedAt } = req.body;

        if (!slotId) {
            return res.status(400).json({ success: false, message: "Slot ID required" });
        }

        // Get slot with lock (using findOneAndUpdate for atomicity)
        const slot = await availabilitySlotModel.findById(slotId);
        if (!slot) {
            return res.status(404).json({ success: false, message: "Slot not found" });
        }

        // Check if session already started
        if (slot.servingSessionStarted) {
            return res.status(409).json({ 
                success: false, 
                message: "Serving session already started for this queue" 
            });
        }

        // Find the first waiting appointment (earliest by token index)
        const firstWaitingAppointment = await appointmentModel.findOne({
            slotId: slotId.toString(),
            status: { $in: ['BOOKED', 'WAITING'] }
        }).sort({ slotTokenIndex: 1 });

        if (!firstWaitingAppointment) {
            return res.status(400).json({ 
                success: false, 
                message: "No waiting appointments found to start serving" 
            });
        }

        // Set session started and start serving first appointment
        const now = startedAt ? new Date(startedAt).getTime() : Date.now();
        slot.servingSessionStarted = true;
        slot.currentToken = firstWaitingAppointment.slotTokenIndex;
        slot.servingAppointmentId = firstWaitingAppointment._id.toString();
        slot.updatedAt = Date.now();
        await slot.save();

        // Update first appointment to SERVING status
        firstWaitingAppointment.status = 'SERVING';
        firstWaitingAppointment.servingStartedAt = now;
        if (doctorId) {
            firstWaitingAppointment.servingStartedBy = doctorId;
        }
        await firstWaitingAppointment.save();

        // Get all appointments for queue update
        const allAppointments = await appointmentModel.find({
            slotId: slotId.toString(),
            status: { $ne: 'CANCELLED' }
        }).sort({ slotTokenIndex: 1 });

        // Build positionInQueueMap for efficient client updates
        const positionInQueueMap = {};
        for (const apt of allAppointments) {
            const position = Math.max(0, apt.slotTokenIndex - slot.currentToken);
            positionInQueueMap[apt._id.toString()] = position;
        }

        // Emit queue_update event
        const { emitQueueUpdate } = await import('../socket.js');
        if (emitQueueUpdate) {
            const affectedAppointmentIds = allAppointments.map(apt => apt._id.toString());
            const lastUpdatedAt = new Date().toISOString();

            // Emit for each appointment with positionInQueueMap
            for (const apt of allAppointments) {
                const position = positionInQueueMap[apt._id.toString()];
                const estimatedWait = position * slot.averageConsultationTime;

                emitQueueUpdate(
                    apt._id.toString(),
                    slotId,
                    {
                        currentToken: slot.currentToken,
                        servingAppointmentId: slot.servingAppointmentId,
                        yourTokenNumber: apt.slotTokenIndex,
                        positionInQueue: position,
                        estimatedWaitMin: Math.round(estimatedWait),
                        averageServiceTimePerPatient: slot.averageConsultationTime,
                        lastUpdatedAt,
                        positionInQueueMap // Include map for all clients
                    },
                    affectedAppointmentIds
                );
            }
        }

        // Telemetry
        console.log(`[TELEMETRY] doctor_start_session: { slotId: ${slotId}, doctorId: ${doctorId}, firstToken: ${firstWaitingAppointment.slotTokenIndex} }`);

        res.json({
            success: true,
            message: "Serving session started successfully",
            queueState: {
                slotId: slot._id.toString(),
                servingSessionStarted: slot.servingSessionStarted,
                currentToken: slot.currentToken,
                servingAppointmentId: slot.servingAppointmentId,
                averageServiceTimePerPatient: slot.averageConsultationTime
            },
            servingAppointment: {
                _id: firstWaitingAppointment._id.toString(),
                slotTokenIndex: firstWaitingAppointment.slotTokenIndex,
                status: firstWaitingAppointment.status,
                servingStartedAt: firstWaitingAppointment.servingStartedAt,
                userData: firstWaitingAppointment.userData
            }
        });
    } catch (error) {
        console.error('Error starting session:', error);
        res.status(500).json({ success: false, message: error.message || "Failed to start session" });
    }
};

/**
 * Get queue state for a slot
 */
export const getQueueState = async (req, res) => {
    try {
        const { slotId } = req.params;

        const slot = await availabilitySlotModel.findById(slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        // Get all appointments in this slot
        const appointments = await appointmentModel.find({
            slotId: slotId.toString(),
            status: { $ne: 'CANCELLED' }
        }).sort({ slotTokenIndex: 1 });

        const waitingTokens = appointments
            .filter(apt => apt.status === 'BOOKED' || apt.status === 'WAITING')
            .map(apt => apt.slotTokenIndex);

        res.json({
            success: true,
            queueState: {
                queueId: slotId,
                currentToken: slot.currentToken,
                servingAppointmentId: slot.servingAppointmentId,
                waitingTokens,
                averageServiceTimePerPatient: slot.averageConsultationTime,
                lastUpdatedAt: new Date(slot.updatedAt).toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting queue state:', error);
        res.json({ success: false, message: error.message });
    }
};

