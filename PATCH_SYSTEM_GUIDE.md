# Patch Management System - User Guide

## Overview

The Patch Management System allows you to generate, distribute, and apply patches to update both backend and frontend code without requiring a full application rebuild.

## Features

- ✅ Generate patches from code changes
- ✅ Apply patches via UI or API
- ✅ Automatic file backups before modification
- ✅ Rollback on error
- ✅ Patch history tracking
- ✅ Version management
- ✅ Support for backend and frontend patches

## Generating Patches

### Using the CLI Tool

```bash
cd backend
tsx scripts/generatePatch.ts \
  --description "Fix EM6400 duplicate events" \
  --target backend \
  --files "src/services/dataCollector.ts,src/routes/patches.ts" \
  --author "Your Name"
```

This will:
1. Read the specified files
2. Generate a patch JSON file
3. Save it to `backend/patches/` directory
4. Store metadata in the database

### Manual Patch Creation

Create a JSON file with this structure:

```json
{
  "metadata": {
    "version": "1.0.1",
    "patchId": "patch-20250101-001",
    "description": "Your patch description",
    "target": "backend",
    "createdAt": "2025-01-01T10:00:00Z",
    "requiresVersion": "1.0.0",
    "author": "Your Name"
  },
  "files": [
    {
      "path": "backend/src/services/dataCollector.ts",
      "operation": "modify",
      "changes": [
        {
          "type": "replace",
          "search": "old code block",
          "replace": "new code block"
        }
      ]
    }
  ]
}
```

## Applying Patches

### Via Frontend UI

1. Log in as **admin**
2. Navigate to **Patches** tab in the dashboard
3. Click **"Choose File"** and select your patch JSON file
4. Click **"Apply Patch"**
5. Wait for confirmation
6. **Restart backend** if required (you'll be notified)

### Via API

```bash
curl -X POST http://localhost:3001/api/patches/apply/backend \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "patch=@your-patch-file.json"
```

## Patch Operations

### 1. Add New File

```json
{
  "path": "backend/src/newFile.ts",
  "operation": "add",
  "content": "// New file content here"
}
```

### 2. Modify Existing File

```json
{
  "path": "backend/src/services/dataCollector.ts",
  "operation": "modify",
  "changes": [
    {
      "type": "replace",
      "search": "old code",
      "replace": "new code"
    },
    {
      "type": "insert",
      "lineStart": 100,
      "content": "// New line inserted here"
    },
    {
      "type": "delete",
      "lineStart": 50,
      "lineEnd": 55
    }
  ]
}
```

### 3. Delete File

```json
{
  "path": "backend/src/oldFile.ts",
  "operation": "delete"
}
```

## Safety Features

1. **Automatic Backups**: Files are backed up before modification
2. **Rollback on Error**: If patch application fails, files are restored
3. **Duplicate Detection**: Prevents applying the same patch twice
4. **Version Checking**: Ensures patch compatibility
5. **Admin Only**: Only admins can generate and apply patches

## Viewing Patch History

- **Frontend**: Go to Patches tab → View "Patch History" and "Recent Applications"
- **API**: `GET /api/patches/history`

## Best Practices

1. **Test patches** in a development environment first
2. **Backup your database** before applying patches
3. **Document changes** in the patch description
4. **Use version numbers** consistently
5. **Keep patch files** for rollback purposes

## Troubleshooting

### Patch Application Fails

- Check backend logs for error messages
- Verify file paths are correct
- Ensure you have admin permissions
- Check if patch was already applied

### Files Not Updating

- Restart backend after applying patches
- Check file permissions
- Verify patch target (backend/frontend/both)

### Frontend Patches

Note: Frontend patches require app restart to take effect since the code is bundled. Consider:
- Using runtime configuration
- Hot module replacement (development only)
- Full app rebuild for production

## API Endpoints

- `POST /api/patches/generate` - Generate a new patch (admin only)
- `POST /api/patches/apply/backend` - Apply backend patch (admin only)
- `GET /api/patches/history` - Get patch history
- `GET /api/patches/download/:patchId` - Download patch file
- `GET /api/patches/applications` - Get application history

