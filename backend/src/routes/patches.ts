import express from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { generatePatch, applyBackendPatch, getPatchHistory, getPatchFile } from '../services/patchService.js';
import fs from 'fs/promises';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Use backend/uploads/patches directory
    const uploadDir = path.join(__dirname, '../../uploads/patches');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `patch-${uniqueSuffix}.json`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All routes require authentication
router.use(authenticateToken);

/**
 * Generate a patch from file changes
 * POST /api/patches/generate
 * Body: { description, target, files, author? }
 */
router.post('/generate', async (req: AuthRequest, res) => {
  try {
    // Only admin can generate patches
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can generate patches' });
    }
    
    const { description, target, files, author } = req.body;
    
    if (!description || !target || !files || !Array.isArray(files)) {
      return res.status(400).json({ error: 'Missing required fields: description, target, files' });
    }
    
    if (!['backend', 'frontend', 'both'].includes(target)) {
      return res.status(400).json({ error: 'Target must be backend, frontend, or both' });
    }
    
    const patch = await generatePatch(
      description,
      target,
      files,
      author || req.userId || 'System Admin'
    );
    
    res.json({ 
      success: true, 
      patch,
      message: `Patch ${patch.metadata.patchId} generated successfully`
    });
  } catch (error: any) {
    console.error('Error generating patch:', error);
    res.status(500).json({ error: error.message || 'Failed to generate patch' });
  }
});

/**
 * Apply a backend patch
 * POST /api/patches/apply/backend
 * Form data: patch file (JSON)
 */
router.post('/apply/backend', upload.single('patch'), async (req: AuthRequest, res) => {
  try {
    // Only admin can apply patches
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can apply patches' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No patch file provided' });
    }
    
    const result = await applyBackendPatch(req.file.path, req.userId || 'system');
    
    // Clean up uploaded file after processing
    try {
      await fs.unlink(req.file.path);
    } catch (e) {
      console.warn('Could not delete uploaded patch file:', e);
    }
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        requiresRestart: result.requiresRestart
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error: any) {
    console.error('Error applying patch:', error);
    res.status(500).json({ error: error.message || 'Failed to apply patch' });
  }
});

/**
 * Get patch history
 * GET /api/patches/history
 */
router.get('/history', async (req: AuthRequest, res) => {
  try {
    const history = await getPatchHistory();
    res.json({ success: true, history });
  } catch (error: any) {
    console.error('Error fetching patch history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch patch history' });
  }
});

/**
 * Download patch file by ID
 * GET /api/patches/download/:patchId
 */
router.get('/download/:patchId', async (req: AuthRequest, res) => {
  try {
    const { patchId } = req.params;
    const patch = await getPatchFile(patchId);
    
    if (!patch) {
      return res.status(404).json({ error: 'Patch not found' });
    }
    
    res.json({ success: true, patch });
  } catch (error: any) {
    console.error('Error downloading patch:', error);
    res.status(500).json({ error: error.message || 'Failed to download patch' });
  }
});

/**
 * Get patch application history
 * GET /api/patches/applications
 */
router.get('/applications', async (req: AuthRequest, res) => {
  try {
    const { db } = await import('../db/connection.js');
    const result = await db.query(
      `SELECT 
        pa.*,
        p.description,
        p.version
       FROM patch_applications pa
       JOIN patches p ON pa.patch_id = p.patch_id
       ORDER BY pa.applied_at DESC
       LIMIT 100`
    );
    
    res.json({ success: true, applications: result.rows });
  } catch (error: any) {
    console.error('Error fetching patch applications:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch patch applications' });
  }
});

export { router as patchRoutes };

