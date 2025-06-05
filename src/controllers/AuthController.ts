import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from "../models/userModel"
import { Request, Response } from 'express';
import * as dotenv from "dotenv";
import mongoose from 'mongoose';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { OAuth2Client } from 'google-auth-library';  // 🆕 הוסף את זה

dotenv.config()

// 🆕 יצירת Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateUniqueCustomId = async (): Promise<string> => {
    let customId;
    let existingUser;
    
    do {
        customId = crypto.randomBytes(4).toString('hex');
        existingUser = await User.findById(customId);
    } while (existingUser);
    
    return customId;
};

const generateToken = (id: string): string => {
    return jwt.sign({ id }, process.env.SECRET_KEY, { expiresIn: '1h' });
};

class AuthController {
    register = async (req: Request, res: Response): Promise<void> => {
        console.log("Entered RegisterController");
        console.log("Request Register body: ", req.body);
        try {
            const { 
                firstName, 
                lastName, 
                avatar, 
                birthDate, 
                email, 
                password, 
                about, 
                occupation, 
                hobbies, 
                genderInterest,
                gender  // Added gender field
            } = req.body;
    
            if (!password) {
                res.status(400).json({ message: 'Password must be provided' });
                return;
            }
    
            const userExists_email = await User.findOne({ email });
            if (userExists_email) {
                res.status(400).json({ message: 'Email already exists' });
                return;
            }
    
            const customId = await generateUniqueCustomId();
            const hashedPassword = await bcrypt.hash(password, 10);
    
            const user = new User({
                _id: customId,
                avatar,
                firstName,
                lastName,
                email,
                password: hashedPassword,
                birthDate: new Date(birthDate.split("/").reverse().join("-")),
                about: about || "",
                occupation: occupation || "",
                gender: gender || "", // Added gender field
                genderInterest: genderInterest || "",
                hobbies: hobbies || [],
            });
    
            await user.save();
    
            res.status(201).json({
                id: user._id,
                avatar: user.avatar,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                birthDate: user.birthDate,
                about: user.about,
                occupation: user.occupation,
                gender: user.gender, // Include gender in response
                genderInterest: user.genderInterest,
                hobbies: user.hobbies,
                token: generateToken(user._id.toString()),
            });
        } catch (error) {
            console.log(error.message);
            res.status(500).json({ message: error.message });
        }
    }

    // 🆕 Google OAuth Authentication
    googleAuth = async (req: Request, res: Response): Promise<void> => {
        console.log("🚀 Entered GoogleAuth Controller");
        console.log("📥 Request body:", req.body);
        
        try {
            const { idToken, email, firstName, lastName, avatar } = req.body;
            
            if (!idToken || !email) {
                res.status(400).json({ message: 'ID token and email are required' });
                return;
            }

            // אימות ה-ID token עם Google
            let payload;
            try {
                const ticket = await googleClient.verifyIdToken({
                    idToken: idToken,
                    audience: process.env.GOOGLE_CLIENT_ID
                });
                payload = ticket.getPayload();
                console.log("✅ Google token verified successfully");
                console.log("👤 Google user info:", {
                    email: payload.email,
                    name: payload.name,
                    picture: payload.picture
                });
            } catch (verifyError) {
                console.error("❌ Google token verification failed:", verifyError);
                res.status(401).json({ message: 'Invalid Google token' });
                return;
            }

            // בדיקה אם המשתמש כבר קיים
            let user = await User.findOne({ email: email });
            let isNewUser = false;
            let needsCompletion = false;

            if (!user) {
                // יצירת משתמש חדש
                console.log("👤 Creating new Google user");
                isNewUser = true;
                needsCompletion = true;
                
                const customId = await generateUniqueCustomId();
                user = new User({
                    _id: customId,
                    email: email,
                    firstName: firstName,
                    lastName: lastName,
                    avatar: avatar || payload.picture || "",
                    isGoogleUser: true,
                    // שדות שחסרים ויצטרכו להשלים
                    // birthDate: לא נגדיר - יהיה undefined ויושלם אחר כך
                    gender: "",
                    genderInterest: "",
                    about: "",
                    occupation: "",
                    hobbies: [],
                    dislike: [], // 🔧 הוסף את השדה החדש
                    password: "", // Google users don't have password
                    fcmToken: null, // 🔧 הוסף FCM token
                    lastTokenUpdate: new Date() // 🔧 הוסף last token update
                });
                
                await user.save();
                console.log("✅ New Google user created:", user._id);
            } else {
                // משתמש קיים
                console.log("👋 Existing user found:", user._id);
                
                // בדיקה אם צריך להשלים פרופיל
                needsCompletion = !user.birthDate || !user.gender || !user.genderInterest;
                
                // עדכון פרטים אם נדרש
                if (!user.isGoogleUser) {
                    user.isGoogleUser = true;
                    await user.save();
                }
            }

            // יצירת tokens
            const accessToken = generateToken(user._id.toString());
            const refreshToken = jwt.sign({ id: user._id }, process.env.SECRET_KEY, { expiresIn: "7d" });
            
            // שמירת refresh token
            user.refreshToken = refreshToken;
            await user.save();

            console.log("🎯 Google auth response:", {
                userId: user._id,
                email: user.email,
                isNewUser,
                needsCompletion
            });

            res.status(200).json({
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.avatar,
                accessToken: accessToken,
                refreshToken: refreshToken,
                token: accessToken, // for compatibility
                isNewUser: isNewUser,
                needsCompletion: needsCompletion
            });

        } catch (error) {
            console.error("❌ Google auth error:", error);
            res.status(500).json({ message: "Google authentication failed", error: error.message });
        }
    }

completeGoogleProfile = async (req: Request, res: Response): Promise<void> => {
        console.log("🚀 Entered CompleteGoogleProfile Controller");
        console.log("📥 Request params:", req.params);
        console.log("📥 Request body:", req.body);

        try {
            const { userId } = req.params;
            const { 
                birthDate, 
                gender, 
                genderInterest, 
                about, 
                occupation, 
                hobbies 
            } = req.body;

            if (!userId) {
                res.status(400).json({ message: 'User ID is required' });
                return;
            }

            // מציאת המשתמש
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ message: 'User not found' });
                return;
            }

            console.log("👤 Found user:", user.email);

            // עדכון הפרופיל
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                {
                    birthDate: birthDate ? new Date(birthDate.split("/").reverse().join("-")) : user.birthDate,
                    gender: gender || user.gender,
                    genderInterest: genderInterest || user.genderInterest,
                    about: about || user.about || "",
                    occupation: occupation || user.occupation || "",
                    hobbies: hobbies || user.hobbies || []
                },
                { new: true }
            );

            if (!updatedUser) {
                res.status(404).json({ message: 'Failed to update user' });
                return;
            }

            console.log("✅ Profile completed successfully for user:", updatedUser._id);

            // יצירת token חדש
            const accessToken = generateToken(updatedUser._id.toString());
            const refreshToken = jwt.sign({ id: updatedUser._id }, process.env.SECRET_KEY, { expiresIn: "7d" });

            updatedUser.refreshToken = refreshToken;
            await updatedUser.save();

            res.status(200).json({
                id: updatedUser._id,
                email: updatedUser.email,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                avatar: updatedUser.avatar,
                birthDate: updatedUser.birthDate,
                gender: updatedUser.gender,
                genderInterest: updatedUser.genderInterest,
                about: updatedUser.about,
                occupation: updatedUser.occupation,
                hobbies: updatedUser.hobbies,
                accessToken: accessToken,
                refreshToken: refreshToken,
                token: accessToken, // for compatibility
                isNewUser: false,
                needsCompletion: false
            });

        } catch (error) {
            console.error("❌ Complete profile error:", error);
            res.status(500).json({ message: "Failed to complete profile", error: error.message });
        }
    }

    login = async (req: Request, res: Response): Promise<void> => {
        console.log("Entered LoginController");
        try {
            const { email, password } = req.body;
            const user = await User.findOne({ email });
            if (!user) {
                res.status(401).json({ message: "Invalid email or password" });
                return;
            }

            const matchPassword = await bcrypt.compare(password, user.password);
            if (!matchPassword) {
                res.status(401).json({ message: "Invalid email or password" });
                return;
            }

            const refreshToken = jwt.sign({ id: user._id }, process.env.SECRET_KEY, { expiresIn: "7d" });
            user.refreshToken = refreshToken;
            await user.save();

            res.json({
                id: user._id,
                avatar: user.avatar,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                birthDate: user.birthDate,
                accessToken: generateToken(user._id.toString()),
                refreshToken: refreshToken,
            });
        } catch (error) {
            res.status(500).json({ message: error.message });
        }
    }

    fetchProfile = async (req: Request, res: Response): Promise<void> => {
        console.log("Entered FetchProfileController");
        try {
            const { userId } = req.params;
            const user = await User.findOne({ _id: userId });

            if (!user) {
                res.status(404).json({ message: "User not found" });
                return;
            }

            console.log("User found: ", user);
            res.json(user);
        } catch (error) {
            res.status(500).json({ message: "Internal server error", error: error.message });
        }
    }

    updateAbout = async (req: Request, res: Response): Promise<void> => {
        try {
            const { userId, aboutContent } = req.body;

            const updatedUser = await User.findOneAndUpdate(
                { _id: userId },
                { about: aboutContent },
                { new: true }
            );

            if (!updatedUser) {
                res.status(404).json({ message: "User not found" });
                return;
            }

            res.json({
                id: updatedUser._id,
                avatar: updatedUser.avatar,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                email: updatedUser.email,
                birthDate: updatedUser.birthDate,
                about: updatedUser.about,
            });
        } catch (error) {
            res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };


    updateProfile = async (req: Request, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const updatedFields = req.body;
    
            console.log("🛠️ Received update for user:", id);
            console.log("🧠 Fields:", updatedFields);
    
            const updatedUser = await User.findByIdAndUpdate(
                id,
                { $set: updatedFields }, // <- FORCE the set including hobbies
                { new: true } 
            );
    
            if (!updatedUser) {
                res.status(404).json({ message: "User not found" });
                return;
            }
    
            res.status(200).json(updatedUser);
        } catch (error) {
            res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };

    getUserById = async (req: Request, res: Response): Promise<void> => {
        console.log("Entered getUserByIdController");
        try {
            const { userId } = req.params;
            
            const user = await User.findOne({_id: userId});
            
            if (!user) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            console.log("User found by ID: ", user);
            res.json({
                id: user._id,
                avatar: user.avatar,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                birthDate: user.birthDate,
                about: user.about,
                occupation: user.occupation,
                hobbies: user.hobbies
            });
        } catch (error) {
            res.status(500).json({ message: "Internal server error", error: error.message });
        }
    }

    analyzeProfilePhoto = async (req: Request, res: Response): Promise<void> => {
        try {
            const { imageBase64 } = req.body;
    
            if (!imageBase64) {
                res.status(400).json({ message: 'No image provided' });
                console.log('No image provided');
                return;
            }
            
            if (!this.isValidBase64(imageBase64)) {
                console.log('Invalid image format. First 50 chars:', imageBase64.substring(0, 50));
                res.status(400).json({ message: 'Invalid image format' });
                return;
            }
    
            console.log('Valid base64 image received, processing...');
    
            // ניקוי המחרוזת - הסרת סימני שורה חדשה ורווחים
            let cleanBase64 = imageBase64;
            if (imageBase64.startsWith('data:image')) {
                // שליפת החלק של ה-base64 בלבד
                const base64Parts = imageBase64.split('base64,');
                if (base64Parts.length >= 2) {
                    const base64Data = base64Parts[1];
                    // ניקוי תווים לא רצויים (רווחים, שורות חדשות וכו')
                    cleanBase64 = base64Data.replace(/[\s\r\n]+/g, '');
                }
            } else {
                // ניקוי תווים לא רצויים אם זו מחרוזת base64 רגילה
                cleanBase64 = imageBase64.replace(/[\s\r\n]+/g, '');
            }
    
            console.log('Base64 cleaned. Length:', cleanBase64.length);
    
            // פרומפט מעודכן - יחזיר הודעה גנרית אם התמונה אינה של בן אדם
            const prompt = `First, verify if this is a photograph of a real human person.
    
    IF THIS IS NOT A PHOTO OF A REAL HUMAN PERSON, respond only with this exact message: "Please upload a photo of a person and not of a "fill based on the character" for profile analysis." and nothing else.
    
    IF THIS IS A PHOTO OF A REAL HUMAN PERSON, analyze this dating profile photo and provide feedback in EXACTLY ONE SENTENCE with THREE specific tips.
    
    This is a photo for a dating profile, but I'm looking for a professional LinkedIn-style approach: trustworthy, approachable, yet still personal and engaging.
    
    Ignore any aspects that are already good (like lighting if it's already clear) and focus on three areas for improvement such as:
    - Professional framing/composition
    - Background choice and setting
    - Facial expression and approachability
    - Body language and posture
    - Professional yet warm appearance
    
    Your response MUST be a single sentence containing exactly three unique improvement tips that this specific photo actually needs.
    For example: "To enhance your dating profile photo while maintaining professional appeal, consider a more neutral background, position yourself slightly to the side, and add a subtle, confident smile."
    
    Be specific to this exact photo, don't give generic advice if that aspect is already good.`;
    
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
            const imagePart = {
                inlineData: {
                    data: cleanBase64, // שימוש בגרסה המנוקה
                    mimeType: 'image/jpeg'
                }
            };
            
            console.log('Sending request to Gemini API...');
            const result = await model.generateContent([prompt, imagePart]);
            const response = result.response;
            const text = response.text();
            
            console.log('Received response from Gemini API:', text);
            
            // פשוט מחזירים את תשובת המודל - בין אם זו הודעת שגיאה על תמונה לא של אדם או טיפים לשיפור התמונה
            res.status(200).json({ feedback: text });
        } catch (error) {
            console.error('Error analyzing profile photo:', error);
            res.status(500).json({ 
                message: 'Failed to analyze photo', 
                error: error.message 
            });
        }
    };

    private isValidBase64(str: string): boolean {
        try {
            // בדיקה אם זה Data URI
            if (str.startsWith('data:image')) {
                // בדיקה יותר גמישה - נקבל כל מחרוזת שמתחילה ב-data:image
                // ומכילה base64 במקום בדיקת התאמה מדויקת לפורמט
                return str.includes('base64,');
            }
            
            // אם זה לא Data URI, בדוק אם זו מחרוזת base64 תקינה
            // גישה יותר מקלה - נבדוק שרוב התווים תקינים
            const validChars = str.replace(/[^A-Za-z0-9+/=]/g, '').length;
            const totalChars = str.length;
            
            // אם לפחות 90% מהתווים תקינים, נקבל את המחרוזת
            return validChars / totalChars > 0.9;
        } catch (e) {
            console.error('Error validating base64:', e);
            return false;
        }
    }

    deleteUser = async (req: Request, res: Response): Promise<void> => {
        console.log("Entered DeleteUserController");
        try {
            const { userId } = req.params;
    
            // Find and delete the user by ID
            const deletedUser = await User.findByIdAndDelete(userId);
    
            if (!deletedUser) {
                res.status(404).json({ message: "User not found" });
                return;
            }
    
            res.status(200).json({ message: "User deleted successfully", userId });
        } catch (error) {
            console.error("Error deleting user:", error);
            res.status(500).json({ message: "Internal server error", error: error.message });
        }
    };
}

export default new AuthController();