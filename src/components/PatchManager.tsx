import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, Download, History, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface PatchHistoryItem {
  id: number;
  patch_id: string;
  version: string;
  description: string;
  target: string;
  created_at: string;
  success_count: number;
  failed_count: number;
  last_applied: string | null;
}

interface PatchApplication {
  id: number;
  patch_id: string;
  target: string;
  applied_at: string;
  applied_by: string;
  status: string;
  error_message: string | null;
  description: string;
  version: string;
}

export function PatchManager() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [applying, setApplying] = useState(false);
  const [history, setHistory] = useState<PatchHistoryItem[]>([]);
  const [applications, setApplications] = useState<PatchApplication[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadHistory();
    loadApplications();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getPatchHistory();
      setHistory(data);
    } catch (error: any) {
      toast.error(`Failed to load patch history: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    try {
      const data = await api.getPatchApplications();
      setApplications(data);
    } catch (error: any) {
      console.error('Failed to load patch applications:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        toast.error('Please select a JSON file');
        return;
      }
      setSelectedFile(file);
    }
  };

  const applyPatch = async () => {
    if (!selectedFile) {
      toast.error('Please select a patch file');
      return;
    }

    setApplying(true);
    try {
      const result = await api.applyPatch(selectedFile);

      if (result.success) {
        toast.success(result.message || 'Patch applied successfully');
        setSelectedFile(null);
        // Reset file input
        const fileInput = document.getElementById('patch-file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        
        // Reload history
        await loadHistory();
        await loadApplications();

        // Show restart message if needed
        if (result.requiresRestart) {
          toast.info('Backend restart required for changes to take effect', {
            duration: 5000,
          });
        }
      } else {
        toast.error(result.message || 'Failed to apply patch');
      }
    } catch (error: any) {
      toast.error(`Error applying patch: ${error.message}`);
    } finally {
      setApplying(false);
    }
  };

  const downloadPatch = async (patchId: string) => {
    try {
      const patch = await api.downloadPatch(patchId);
      const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${patchId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Patch downloaded successfully');
    } catch (error: any) {
      toast.error(`Failed to download patch: ${error.message}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Patch Manager</h1>
          <p className="text-muted-foreground mt-1">
            Apply patches to update backend and frontend code
          </p>
        </div>
        <Button onClick={loadHistory} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Apply Patch Section */}
      <Card>
        <CardHeader>
          <CardTitle>Apply Patch</CardTitle>
          <CardDescription>
            Upload a patch file (JSON) to apply updates to the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="patch-file-input">Patch File</Label>
              <Input
                id="patch-file-input"
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="mt-1"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
            <Button
              onClick={applyPatch}
              disabled={!selectedFile || applying}
              className="w-full"
            >
              {applying ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Applying Patch...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Apply Patch
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Patch History */}
      <Card>
        <CardHeader>
          <CardTitle>Patch History</CardTitle>
          <CardDescription>
            List of all available patches
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No patches found</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patch ID</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Applications</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((patch) => (
                  <TableRow key={patch.id}>
                    <TableCell className="font-mono text-xs">{patch.patch_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{patch.version}</Badge>
                    </TableCell>
                    <TableCell>{patch.description}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{patch.target}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(patch.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {patch.success_count > 0 && (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {patch.success_count}
                          </Badge>
                        )}
                        {patch.failed_count > 0 && (
                          <Badge variant="destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {patch.failed_count}
                          </Badge>
                        )}
                        {patch.success_count === 0 && patch.failed_count === 0 && (
                          <span className="text-muted-foreground text-sm">Never applied</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => downloadPatch(patch.patch_id)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Applications */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Applications</CardTitle>
          <CardDescription>
            History of patch applications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No patch applications found</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patch ID</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied By</TableHead>
                  <TableHead>Applied At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.slice(0, 10).map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-mono text-xs">{app.patch_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{app.version}</Badge>
                    </TableCell>
                    <TableCell>
                      {app.status === 'success' ? (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Success
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{app.applied_by}</TableCell>
                    <TableCell>{formatDate(app.applied_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

