import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = express.Router();

// Login validation schema
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Register validation schema
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).default('user'),
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const userResult = await db.query(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userResult.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id, user.email, user.role);

    // Get user's device permissions
    const permissionsResult = await db.query(
      'SELECT device_id FROM user_device_permissions WHERE user_id = $1',
      [user.id]
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        deviceIds: permissionsResult.rows.map(row => row.device_id),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, role FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get user's device permissions
    const permissionsResult = await db.query(
      'SELECT device_id FROM user_device_permissions WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      deviceIds: permissionsResult.rows.map(row => row.device_id),
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Register (admin only)
router.post('/register', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { email, password, role } = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = `user-${Date.now()}`;
    await db.query(
      'INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [userId, email, passwordHash, role || 'user']
    );

    res.status(201).json({
      id: userId,
      email,
      role: role || 'user',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }).parse(req.body);

    // Get current user
    const userResult = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, req.userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

/**
 * Generate a secure recovery code
 */
function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get current recovery code (admin only)
router.get('/recovery-code', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get current user's recovery code
    const userResult = await db.query(
      'SELECT recovery_code FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const recoveryCode = userResult.rows[0].recovery_code;

    if (!recoveryCode) {
      return res.status(404).json({ error: 'No recovery code found. Please generate one first.' });
    }

    // Return the plain recovery code (it's stored as plain text for comparison)
    res.json({ recoveryCode });
  } catch (error) {
    console.error('Get recovery code error:', error);
    res.status(500).json({ error: 'Failed to get recovery code' });
  }
});

// Generate/regenerate recovery code (admin only)
router.post('/recovery-code/generate', authenticateToken, async (req: AuthRequest, res) => {
  try {
    // Check if user is admin
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Generate new recovery code
    const recoveryCode = generateRecoveryCode();

    // Store recovery code (plain text for comparison - in production, consider hashing)
    await db.query(
      'UPDATE users SET recovery_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [recoveryCode, req.userId]
    );

    res.json({ recoveryCode, message: 'Recovery code generated successfully' });
  } catch (error) {
    console.error('Generate recovery code error:', error);
    res.status(500).json({ error: 'Failed to generate recovery code' });
  }
});

// Recover password using recovery code (public endpoint)
router.post('/recover-password', async (req, res) => {
  try {
    const { email, recoveryCode, newPassword } = z.object({
      email: z.string().email(),
      recoveryCode: z.string().length(8, 'Recovery code must be 8 characters'),
      newPassword: z.string().min(6, 'Password must be at least 6 characters'),
    }).parse(req.body);

    // Find user by email
    const userResult = await db.query(
      'SELECT id, recovery_code, role FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if user is admin (only admins can use recovery codes)
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Recovery codes are only available for admin users' });
    }

    // Verify recovery code
    if (!user.recovery_code) {
      return res.status(401).json({ error: 'No recovery code found for this user. Please generate one first.' });
    }
    
    if (user.recovery_code !== recoveryCode.toUpperCase()) {
      return res.status(401).json({ error: 'Incorrect recovery code. Please check and try again.' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear recovery code (one-time use)
    await db.query(
      'UPDATE users SET password_hash = $1, recovery_code = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPasswordHash, user.id]
    );

    res.json({ message: 'Password recovered successfully. Please login with your new password.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Recover password error:', error);
    res.status(500).json({ error: 'Failed to recover password' });
  }
});

export { router as authRoutes };

