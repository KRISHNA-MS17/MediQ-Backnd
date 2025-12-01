import express from 'express';
import { 
    createAvailability, 
    getAvailability, 
    updateAvailability, 
    deleteAvailability,
    getSlotsForDate 
} from '../controllers/availabilityController.js';
import authDoctor from '../middlewares/authDoctor.js';
import authUser from '../middlewares/authUser.js';

const availabilityRouter = express.Router();

// Public: Get slots for a date (for booking page)
availabilityRouter.get('/slots/:doctorId', getSlotsForDate);

// Doctor only: Manage availability
availabilityRouter.post('/create', authDoctor, createAvailability);
availabilityRouter.get('/list', authDoctor, getAvailability);
availabilityRouter.put('/:slotId', authDoctor, updateAvailability);
availabilityRouter.delete('/:slotId', authDoctor, deleteAvailability);

export default availabilityRouter;


