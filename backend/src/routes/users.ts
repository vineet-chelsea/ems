import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { authenticateToken, requireAdmin, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all users (admin only)
router.get('/', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, role, created_at, updated_at FROM users ORDER BY created_at DESC'
    );

    // Get device permissions for each user
    const usersWithPermissions = await Promise.all(
      result.rows.map(async (user) => {
        const permissionsResult = await db.query(
          'SELECT device_id FROM user_device_permissions WHERE user_id = $1',
          [user.id]
        );
        return {
          ...user,
          deviceIds: permissionsResult.rows.map(row => row.device_id),
        };
      })
    );

    res.json(usersWithPermissions);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID (admin only)
router.get('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, role, created_at, updated_at FROM users WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get device permissions
    const permissionsResult = await db.query(
      'SELECT device_id FROM user_device_permissions WHERE user_id = $1',
      [req.params.id]
    );

    res.json({
      ...user,
      deviceIds: permissionsResult.rows.map(row => row.device_id),
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user device permissions (admin only)
router.put('/:id/permissions', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { deviceIds } = z.object({
      deviceIds: z.array(z.string()),
    }).parse(req.body);

    const userId = req.params.id;

    // Verify user exists
    const userResult = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify all devices exist
    if (deviceIds.length > 0) {
      const deviceResult = await db.query(
        `SELECT id FROM devices WHERE id = ANY($1::text[])`,
        [deviceIds]
      );
      if (deviceResult.rows.length !== deviceIds.length) {
        return res.status(400).json({ error: 'One or more devices not found' });
      }
    }

    // Delete existing permissions
    await db.query('DELETE FROM user_device_permissions WHERE user_id = $1', [userId]);

    // Insert new permissions
    if (deviceIds.length > 0) {
      const values = deviceIds.map((deviceId, index) => 
        `($1, $${index + 2})`
      ).join(', ');
      const params = [userId, ...deviceIds];
      await db.query(
        `INSERT INTO user_device_permissions (user_id, device_id) VALUES ${values}`,
        params
      );
    }

    res.json({ message: 'Permissions updated successfully', deviceIds });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error updating permissions:', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// Delete user (admin only)
router.delete('/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;

    // Prevent deleting yourself
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully', id: userId });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Admin reset password
router.post('/:id/reset-password', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { newPassword } = z.object({
      newPassword: z.string().min(6),
    }).parse(req.body);

    const userId = req.params.id;

    // Verify user exists
    const userResult = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export { router as userRoutes };

