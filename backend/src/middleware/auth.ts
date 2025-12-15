import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/connection.js';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token and attach user info to request
 */
export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string };
    
    // Verify user still exists
    const result = await db.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware to check if user is admin
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Check if user has permission to access a device
 */
export async function checkDevicePermission(
  userId: string,
  userRole: string,
  deviceId: string
): Promise<boolean> {
  // Admins have access to all devices
  if (userRole === 'admin') {
    return true;
  }

  // Check if user has permission for this device
  const result = await db.query(
    'SELECT id FROM user_device_permissions WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  );

  return result.rows.length > 0;
}

/**
 * Generate JWT token
 */
export function generateToken(userId: string, email: string, role: string): string {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

