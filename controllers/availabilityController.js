import availabilitySlotModel from '../models/availabilitySlotModel.js';
import doctorModel from '../models/doctorModel.js';
import appointmentModel from '../models/appointmentModel.js';

/**
 * Create a new availability slot
 * Supports single date or recurring pattern
 */
export const createAvailability = async (req, res) => {
    try {
        const { doctorId, date, startTime, endTime, slotPeriod, capacity, isRecurring, recurringPattern } = req.body;

        if (!doctorId || !date || !startTime || !endTime) {
            return res.json({ success: false, message: "Missing required fields" });
        }

        // Validate time format
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.json({ success: false, message: "Invalid time format. Use HH:MM (24-hour)" });
        }

        // Validate start < end
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (endMinutes <= startMinutes) {
            return res.json({ success: false, message: "End time must be after start time" });
        }

        // Determine slot period if not provided
        let period = slotPeriod;
        if (!period) {
            if (startMinutes < 13 * 60) period = 'MORNING';
            else if (startMinutes < 18 * 60) period = 'AFTERNOON';
            else period = 'EVENING';
        }

        const slots = [];

        if (isRecurring && recurringPattern) {
            // Create recurring slots
            const { daysOfWeek, repeatUntil, repeatCount } = recurringPattern;
            const startDate = new Date(date);
            const endDate = repeatUntil ? new Date(repeatUntil) : new Date(startDate);
            if (repeatCount) {
                endDate.setDate(startDate.getDate() + (repeatCount * 7));
            }

            let currentDate = new Date(startDate);
            while (currentDate <= endDate) {
                const dayOfWeek = currentDate.getDay();
                if (daysOfWeek.includes(dayOfWeek)) {
                    const dateStr = currentDate.toISOString().split('T')[0];
                    const slot = new availabilitySlotModel({
                        doctorId,
                        date: dateStr,
                        startTime,
                        endTime,
                        slotPeriod: period,
                        capacity,
                        isRecurring: true,
                        recurringPattern: { daysOfWeek, repeatUntil, repeatCount }
                    });
                    slots.push(slot);
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
        } else {
            // Single slot
            const slot = new availabilitySlotModel({
                doctorId,
                date,
                startTime,
                endTime,
                slotPeriod: period,
                capacity,
                isRecurring: false
            });
            slots.push(slot);
        }

        // Save all slots
        const savedSlots = await availabilitySlotModel.insertMany(slots);

        res.json({
            success: true,
            message: `Created ${savedSlots.length} availability slot(s)`,
            slots: savedSlots
        });
    } catch (error) {
        console.error('Error creating availability:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get availability slots for a doctor
 * Can filter by date range
 */
export const getAvailability = async (req, res) => {
    try {
        const { doctorId, startDate, endDate, date } = req.query;

        if (!doctorId) {
            return res.json({ success: false, message: "Doctor ID required" });
        }

        const query = { doctorId, isActive: true };

        if (date) {
            query.date = date;
        } else if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = startDate;
            if (endDate) query.date.$lte = endDate;
        } else {
            // Default: future slots only
            const today = new Date().toISOString().split('T')[0];
            query.date = { $gte: today };
        }

        const slots = await availabilitySlotModel.find(query).sort({ date: 1, startTime: 1 });

        // Filter out past slots (endTime has passed)
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

        const activeSlots = slots.filter(slot => {
            if (slot.date < today) return false;
            if (slot.date === today && slot.endTime <= currentTime) return false;
            return true;
        });

        res.json({
            success: true,
            slots: activeSlots
        });
    } catch (error) {
        console.error('Error getting availability:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Update availability slot
 * Prevents destructive edits if bookings exist
 */
export const updateAvailability = async (req, res) => {
    try {
        const { slotId } = req.params;
        const { startTime, endTime, capacity, isActive } = req.body;

        const slot = await availabilitySlotModel.findById(slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        // Check if slot has bookings
        const bookings = await appointmentModel.countDocuments({
            slotId: slotId.toString(),
            status: { $in: ['BOOKED', 'IN_PROGRESS'] }
        });

        if (bookings > 0 && (startTime || endTime)) {
            // Allow only safe updates (capacity, isActive)
            if (startTime || endTime) {
                return res.json({
                    success: false,
                    message: "Cannot modify time of slot with existing bookings. Consider creating a new slot."
                });
            }
        }

        // Update allowed fields
        if (startTime !== undefined) slot.startTime = startTime;
        if (endTime !== undefined) slot.endTime = endTime;
        if (capacity !== undefined) slot.capacity = capacity;
        if (isActive !== undefined) slot.isActive = isActive;
        slot.updatedAt = Date.now();

        await slot.save();

        res.json({
            success: true,
            message: "Availability updated",
            slot
        });
    } catch (error) {
        console.error('Error updating availability:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Delete availability slot
 * Only if no bookings exist
 */
export const deleteAvailability = async (req, res) => {
    try {
        const { slotId } = req.params;

        const slot = await availabilitySlotModel.findById(slotId);
        if (!slot) {
            return res.json({ success: false, message: "Slot not found" });
        }

        // Check if slot has bookings
        const bookings = await appointmentModel.countDocuments({
            slotId: slotId.toString(),
            status: { $in: ['BOOKED', 'IN_PROGRESS'] }
        });

        if (bookings > 0) {
            return res.json({
                success: false,
                message: "Cannot delete slot with existing bookings. Mark as inactive instead."
            });
        }

        await availabilitySlotModel.findByIdAndDelete(slotId);

        res.json({
            success: true,
            message: "Availability slot deleted"
        });
    } catch (error) {
        console.error('Error deleting availability:', error);
        res.json({ success: false, message: error.message });
    }
};

/**
 * Get slots for a specific date with token information
 * Used by frontend to show available slots and token chips
 */
export const getSlotsForDate = async (req, res) => {
    try {
        const { doctorId } = req.params;
        const { date } = req.query;

        if (!doctorId || !date) {
            return res.json({ success: false, message: "Doctor ID and date required" });
        }

        // Get all slots for this date
        const slots = await availabilitySlotModel.find({
            doctorId,
            date,
            isActive: true
        }).sort({ startTime: 1 });

        // Check if slots are still active (not past end time)
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5);

        const activeSlots = slots.filter(slot => {
            if (slot.date < today) return false;
            if (slot.date === today && slot.endTime <= currentTime) return false;
            return true;
        });

        // Get appointments for each slot to build token array
        const slotsWithTokens = await Promise.all(
            activeSlots.map(async (slot) => {
                const appointments = await appointmentModel.find({
                    slotId: slot._id.toString(),
                    status: { $ne: 'CANCELLED' }
                }).sort({ slotTokenIndex: 1 });

                // Build token array
                const tokens = [];
                const maxTokens = Math.max(slot.totalTokens, appointments.length, 5); // Show at least 5

                for (let i = 1; i <= maxTokens; i++) {
                    const appointment = appointments.find(apt => apt.slotTokenIndex === i);
                    let status = 'AVAILABLE';
                    let estimatedStart = null;

                    if (appointment) {
                        if (appointment.status === 'COMPLETED') status = 'COMPLETED';
                        else if (appointment.status === 'IN_PROGRESS') status = 'IN_PROGRESS';
                        else status = 'BOOKED';
                        estimatedStart = appointment.estimatedStart;
                    } else {
                        // Calculate estimated start for available tokens
                        const slotStart = new Date(`${slot.date}T${slot.startTime}:00`);
                        const estimatedMinutes = (i - 1) * slot.averageConsultationTime;
                        estimatedStart = slotStart.getTime() + (estimatedMinutes * 60 * 1000);
                    }

                    tokens.push({
                        index: i,
                        status,
                        estimatedStart,
                        appointmentId: appointment?._id?.toString() || null
                    });
                }

                return {
                    ...slot.toObject(),
                    currentToken: slot.currentToken,
                    totalTokens: slot.totalTokens,
                    averageConsultationTime: slot.averageConsultationTime,
                    tokens
                };
            })
        );

        res.json({
            success: true,
            slots: slotsWithTokens
        });
    } catch (error) {
        console.error('Error getting slots for date:', error);
        res.json({ success: false, message: error.message });
    }
};


