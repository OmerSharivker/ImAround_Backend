import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from "../models/userModel"
import { Request, Response } from 'express';
import * as dotenv from "dotenv";
import mongoose from 'mongoose';
import Match from '../models/matchModel'

dotenv.config()

class SearchController {
    search = async (req: Request, res: Response): Promise<void> => {
        console.log("\n========== SEARCH REQUEST ==========");
        console.log("Full request body:", JSON.stringify(req.body, null, 2));
        console.log("currentUserId:", req.body.currentUserId);
        console.log("userIds:", req.body.userIds);
        console.log("=====================================\n");
        try {
            const id = req.body.currentUserId;
            const usersIds = req.body.userIds;
    
            if (!usersIds || !Array.isArray(usersIds)) {
                res.status(400).json({ message: 'Invalid users input' });
                return;
            }
    
            // קבלת נתוני המשתמש הנוכחי
            const selfUser = await User.findOne({ _id: id });
            if (!selfUser) {
                res.status(404).json({ message: 'Current user not found' });
                return;
            }
    
            console.log(`Self user: ${selfUser.firstName}, Gender: ${selfUser.gender}, Looking for: ${selfUser.genderInterest}`);
    
            // מציאת כל המשתמשים לפי ה-IDs שנשלחו
            let users = await User.find({ _id: { $in: usersIds } });
            console.log(`Found ${users.length} users before filtering`);
    
            // פילטור 1: הסרת משתמשים שהמשתמש הנוכחי עשה להם dislike
            users = users.filter((user) => !selfUser.dislike?.includes(user._id.toString()));
            console.log(`After dislike filter: ${users.length} users`);
    
            // פילטור 2: פילטור דו-כיווני לפי העדפת מגדר
            users = users.filter((user) => {
                // בדיקה 1: האם המשתמש הנוכחי מעוניין במגדר של היוזר
                const selfInterestedInUser = selfUser.genderInterest === 'Both' || 
                                           selfUser.genderInterest === user.gender;
                
                // בדיקה 2: האם היוזר מעוניין במגדר של המשתמש הנוכחי
                const userInterestedInSelf = user.genderInterest === 'Both' || 
                                           user.genderInterest === selfUser.gender;
                
                // רק אם שני הצדדים מעוניינים זה בזה
                const mutualInterest = selfInterestedInUser && userInterestedInSelf;
                
                if (!mutualInterest) {
                    console.log(`❌ Filtered out ${user.firstName}:`);
                    console.log(`   ${user.firstName} (${user.gender}) looking for: ${user.genderInterest}`);
                    console.log(`   ${selfUser.firstName} (${selfUser.gender}) looking for: ${selfUser.genderInterest}`);
                    console.log(`   Self interested in user: ${selfInterestedInUser}`);
                    console.log(`   User interested in self: ${userInterestedInSelf}`);
                } else {
                    console.log(`✅ Keeping ${user.firstName} - mutual interest confirmed`);
                }
                
                return mutualInterest;
            });
            console.log(`After bidirectional gender filter: ${users.length} users`);
    
       // פילטור 3: הסרת משתמשים שיש איתם כבר מאץ'
const existingMatches = await Match.find({
    participants: { $in: [id] }
});

console.log(`Found ${existingMatches.length} total matches for user ${id}`);

// יצירת מערך של user IDs שיש איתם כבר מאץ'
const matchedUserIds = new Set<string>();
existingMatches.forEach((match, index) => {
    console.log(`Match ${index + 1}: ${match._id}, participants: [${match.participants.join(', ')}]`);
    
    match.participants.forEach(participantId => {
        if (participantId !== id) {
            matchedUserIds.add(participantId);
            console.log(`  → Added ${participantId} to already matched users`);
        }
    });
});

console.log(`Total unique users already matched with: ${matchedUserIds.size}`);
console.log(`Already matched user IDs: [${Array.from(matchedUserIds).join(', ')}]`);

// הסרת משתמשים שיש איתם כבר מאץ'
users = users.filter((user) => {
    const hasMatch = matchedUserIds.has(user._id.toString());
    if (hasMatch) {
        console.log(`❌ Filtered out user ${user.firstName} (${user._id}) - already matched`);
    } else {
        console.log(`✅ Keeping user ${user.firstName} (${user._id}) - no existing match`);
    }
    return !hasMatch;
});
    
            console.log(`Final result: ${users.length} users after all filters`);
            
            res.json(users);
        } catch (error) {
            console.error('Search error:', error);
            res.status(500).json({ message: 'Server error', error });
        }
    };
}

export default new SearchController();