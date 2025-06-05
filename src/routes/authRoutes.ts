import express from "express";
import AuthController from "../controllers/AuthController"


const router = express.Router()

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/fetchProfile/:userId', AuthController.fetchProfile);
router.post('/updateAbout', AuthController.updateAbout);
router.put('/users/:id', AuthController.updateProfile);
router.get('/getUserById/:userId', AuthController.getUserById);
router.post('/analyzeProfilePhoto', AuthController.analyzeProfilePhoto);
router.delete('/deleteUser/:userId', AuthController.deleteUser);
router.post('/google', AuthController.googleAuth);
router.put('/complete-google-profile/:userId', AuthController.completeGoogleProfile);

export default router;