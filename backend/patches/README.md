# Patch Management System

This directory contains patch files that can be applied to update the backend and frontend code.

## Patch Format

Patches are JSON files with the following structure:

```json
{
  "metadata": {
    "version": "1.0.1",
    "patchId": "patch-20250101-001",
    "description": "Fix EM6400 duplicate events",
    "target": "backend",
    "createdAt": "2025-01-01T10:00:00Z",
    "requiresVersion": "1.0.0",
    "author": "System Admin"
  },
  "files": [
    {
      "path": "backend/src/services/dataCollector.ts",
      "operation": "modify",
      "changes": [
        {
          "type": "replace",
          "search": "old code",
          "replace": "new code"
        }
      ]
    }
  ],
  "dependencies": {
    "npm": {
      "add": ["new-package@1.0.0"],
      "remove": ["old-package"]
    }
  }
}
```

## Generating Patches

Use the CLI tool to generate patches:

```bash
cd backend
tsx scripts/generatePatch.ts --description "Fix description" --target backend --files "src/services/dataCollector.ts" --author "Your Name"
```

## Applying Patches

1. **Via Frontend UI:**
   - Go to Admin Panel → Patches tab
   - Click "Choose File" and select a patch JSON file
   - Click "Apply Patch"
   - Restart backend if required

2. **Via API:**
   ```bash
   curl -X POST http://localhost:3001/api/patches/apply/backend \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "patch=@patch-file.json"
   ```

## Patch Operations

- **add**: Add a new file
- **modify**: Modify an existing file (using replace, insert, or delete changes)
- **delete**: Delete a file

## Safety Features

- Files are automatically backed up before modification
- Rollback on error
- Duplicate patch detection
- Version requirement checking

