import express from 'express'
import bodyParser from 'body-parser';
import { connectDB } from './utils/connectDB';
import authRoutes from './routes/authRoutes';
import searchRoutes from './routes/searchRoutes';
import matchRoutes from './routes/matchRoutes'
import cors from 'cors';
import chatRoutes from './routes/ChatRoutes'
import FirebaseService from './utils/FirebaseService'; // 🔥 הוסף
import { authMiddleware } from './middleware/authMiddleware';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
/*app.use(cors());*/
app.use(cors({
    origin: '*', // your phone's IP or allowed domain
    methods: ['GET', 'POST'], 
  }));

app.get("/", (req, res) => {
    res.send("Server is running!");
});

connectDB();
FirebaseService.initialize(); // 🔥 הוסף כאן

// Public routes (no auth required)
app.use("/auth", authRoutes)

// Protected routes (auth required)
app.use("/search", authMiddleware, searchRoutes)
app.use("/match", authMiddleware, matchRoutes)
app.use("/chat", authMiddleware, chatRoutes)

export default app;