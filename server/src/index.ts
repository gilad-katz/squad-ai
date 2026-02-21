import 'dotenv/config';

import express, { Request, Response } from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import chatRouter from './routes/chat';

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/chat', chatRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
