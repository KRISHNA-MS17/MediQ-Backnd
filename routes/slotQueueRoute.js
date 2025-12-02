import express from 'express';
import { markTokenCompleted, getSlotQueue, markTokenWrong, startServing, getQueueState, startSession } from '../controllers/slotQueueController.js';
import authDoctor from '../middlewares/authDoctor.js';
import authUser from '../middlewares/authUser.js';

const slotQueueRouter = express.Router();

// Doctor: Start serving session for a queue (one-time operation)
slotQueueRouter.post('/queues/:slotId/start_session', authDoctor, startSession);

// Doctor: Start serving an appointment (deprecated - use start_session instead)
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


