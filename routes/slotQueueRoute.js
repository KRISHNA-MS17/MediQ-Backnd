import express from 'express';
import { markTokenCompleted, getSlotQueue, markTokenWrong } from '../controllers/slotQueueController.js';
import authDoctor from '../middlewares/authDoctor.js';
import authUser from '../middlewares/authUser.js';

const slotQueueRouter = express.Router();

// Doctor: Mark token as completed
slotQueueRouter.post('/mark-completed', authDoctor, markTokenCompleted);

// Doctor: Mark token as wrong/skip
slotQueueRouter.post('/mark-wrong', authDoctor, markTokenWrong);

// Public: Get queue snapshot for a slot
slotQueueRouter.get('/:slotId', getSlotQueue);

export default slotQueueRouter;


