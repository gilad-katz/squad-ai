import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/health', healthRouter);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
