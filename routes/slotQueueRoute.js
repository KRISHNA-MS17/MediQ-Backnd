import express from 'express';
import { markTokenCompleted, getSlotQueue } from '../controllers/slotQueueController.js';
import authDoctor from '../middlewares/authDoctor.js';
import authUser from '../middlewares/authUser.js';

const slotQueueRouter = express.Router();

// Doctor: Mark token as completed
slotQueueRouter.post('/mark-completed', authDoctor, markTokenCompleted);

// Public: Get queue snapshot for a slot
slotQueueRouter.get('/:slotId', getSlotQueue);

export default slotQueueRouter;


