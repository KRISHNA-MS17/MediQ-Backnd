import express from 'express';
import { getQueueStatus, updateQueue, updateAverageTime, updateDoctorLocation } from '../controllers/queueController.js';
import authDoctor from '../middlewares/authDoctor.js';

const queueRouter = express.Router();

// Queue Management Routes
queueRouter.post('/get-queue-status', authDoctor, getQueueStatus);
queueRouter.post('/update-queue', authDoctor, updateQueue);
queueRouter.post('/update-avg-time', authDoctor, updateAverageTime);
queueRouter.post('/update-location', authDoctor, updateDoctorLocation);

export default queueRouter;





