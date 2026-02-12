import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';

dotenv.config();

export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Middleware to verify JWT token
 * Returns 401 if token is missing, invalid, or expired
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('❌ Auth middleware: No token provided');
    res.status(401).json({ message: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY as string) as { id: string };
    req.userId = decoded.id;
    console.log('✅ Auth middleware: Token valid for user:', decoded.id);
    next();
  } catch (error: any) {
    console.log('❌ Auth middleware: Token verification failed:', error.message);
    res.status(401).json({ message: 'Invalid or expired token' });
    return;
  }
};
