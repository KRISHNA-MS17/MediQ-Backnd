import express from 'express';
import { markTokenCompleted, getSlotQueue, markTokenWrong, startServing, getQueueState } from '../controllers/slotQueueController.js';
import authDoctor from '../middlewares/authDoctor.js';
import authUser from '../middlewares/authUser.js';

const slotQueueRouter = express.Router();

// Doctor: Start serving an appointment
slotQueueRouter.post('/appointments/:appointmentId/start_serving', authDoctor, startServing);

// Doctor: Mark token as completed
slotQueueRouter.post('/mark-completed', authDoctor, markTokenCompleted);

// Doctor: Mark token as wrong/skip
slotQueueRouter.post('/mark-wrong', authDoctor, markTokenWrong);

// Get queue state for a slot
slotQueueRouter.get('/queues/:slotId/state', getQueueState);

// Public: Get queue snapshot for a slot
slotQueueRouter.get('/:slotId', getSlotQueue);

export default slotQueueRouter;


