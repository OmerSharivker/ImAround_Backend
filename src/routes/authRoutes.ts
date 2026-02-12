import express from "express";
import AuthController from "../controllers/AuthController"
import { authMiddleware } from "../middleware/authMiddleware";


const router = express.Router()

// Public routes (no auth required)
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refreshToken);
router.post('/google', AuthController.googleAuth);

// Protected routes (auth required)
router.get('/fetchProfile/:userId', authMiddleware, AuthController.fetchProfile);
router.post('/updateAbout', authMiddleware, AuthController.updateAbout);
router.put('/users/:id', authMiddleware, AuthController.updateProfile);
router.get('/getUserById/:userId', authMiddleware, AuthController.getUserById);
router.post('/analyzeProfilePhoto', authMiddleware, AuthController.analyzeProfilePhoto);
router.delete('/deleteUser/:userId', authMiddleware, AuthController.deleteUser);
router.put('/complete-google-profile/:userId', authMiddleware, AuthController.completeGoogleProfile);

export default router;