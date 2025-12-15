import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Loader, CheckCircle, XCircle, Upload, Download, FileSpreadsheet, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { 
  generateParameterMappingTemplate, 
  parseParameterMappingFile, 
  validateParameterMapping,
  ParameterMappingRow,
  mappingsToObject
} from "@/utils/excelUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDevice: (device: { 
    name: string; 
    ipAddress: string; 
    subnetMask: string; 
    slaveAddress: number;
    type: string;
    parameterMappings?: Record<string, string>;
  }) => void;
}

export function AddDeviceDialog({ open, onOpenChange, onAddDevice }: AddDeviceDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    type: "PM5320",
    ipAddress: "192.168.0.5",
    subnetMask: "255.255.255.0",
    slaveAddress: 1
  });
  const [pingStatus, setPingStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [parameterMappings, setParameterMappings] = useState<ParameterMappingRow[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePingTest = async () => {
    if (!formData.ipAddress) {
      toast.error('Please enter an IP address first');
      return;
    }

    setPingStatus('testing');
    
    try {
      const result = await api.testDeviceConnection(
        formData.ipAddress,
        formData.slaveAddress ?? 1
      );
      
      if (result.success) {
        setPingStatus('success');
        toast.success(result.message || `Successfully connected to ${formData.ipAddress}`);
      } else {
        setPingStatus('failed');
        toast.error(result.error || 'Connection test failed');
      }
    } catch (error: any) {
      setPingStatus('failed');
      const errorMessage = error.message || 'Failed to test connection';
      toast.error(errorMessage);
      console.error('Connection test error:', error);
    }
  };

  const handleDownloadTemplate = () => {
    try {
      generateParameterMappingTemplate(formData.type);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error generating template:', error);
      toast.error('Failed to generate template');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setUploadError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setExcelFile(file);
    setUploadError(null);

    try {
      const mappings = await parseParameterMappingFile(file);
      
      // Validate all mappings
      const validationResults = mappings.map(validateParameterMapping);
      const invalidMappings = validationResults.filter(r => !r.valid);
      
      if (invalidMappings.length > 0) {
        const errors = invalidMappings.flatMap((r, i) => 
          r.errors.map(e => `Row ${i + 2}: ${e}`)
        );
        setUploadError(`Validation errors:\n${errors.join('\n')}`);
        setParameterMappings([]);
        return;
      }

      setParameterMappings(mappings);
      toast.success(`Successfully parsed ${mappings.length} parameter mapping(s)`);
    } catch (error: any) {
      console.error('Error parsing file:', error);
      setUploadError(error.message || 'Failed to parse Excel file');
      setParameterMappings([]);
    }
  };

  const handleRemoveFile = () => {
    setExcelFile(null);
    setParameterMappings([]);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.ipAddress) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const parameterMappingsObj = parameterMappings.length > 0 
        ? mappingsToObject(parameterMappings)
        : undefined;

      onAddDevice({
        name: formData.name,
        ipAddress: formData.ipAddress,
        subnetMask: "255.255.255.0",
        slaveAddress: formData.slaveAddress ?? 1,
        type: formData.type,
        parameterMappings: parameterMappingsObj,
      });

      // Reset form
      setFormData({
        name: "",
        type: "PM5320", 
        ipAddress: "192.168.0.5",
        subnetMask: "255.255.255.0",
        slaveAddress: 1
      });
      setPingStatus('idle');
      setParameterMappings([]);
      setExcelFile(null);
      setUploadError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setIsSubmitting(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add device');
      setIsSubmitting(false);
    }
  };

  const getPingStatusIcon = () => {
    switch (pingStatus) {
      case 'testing':
        return <Loader className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-destructive" />;
      default:
        return <Wifi className="w-4 h-4" />;
    }
  };

  const getPingStatusColor = () => {
    switch (pingStatus) {
      case 'testing':
        return 'bg-warning text-warning-foreground';
      case 'success':
        return 'bg-success text-success-foreground';
      case 'failed':
        return 'bg-destructive text-destructive-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-primary" />
            Add New Device
          </DialogTitle>
          <DialogDescription>
            Configure a new energy monitoring device. Optionally upload parameter/register mappings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Device Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="device-type">Device Type</Label>
            <Select value={formData.type} onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select device type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PM5320">PM5320 Power Meter</SelectItem>
                <SelectItem value="PM5330">PM5330 Power Meter</SelectItem>
                <SelectItem value="PM5350">PM5350 Power Meter</SelectItem>
                <SelectItem value="Custom">Custom Device</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Device Name */}
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              placeholder="e.g., Main Distribution Panel"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Network Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ip-address">IP Address</Label>
              <Input
                id="ip-address"
                placeholder="192.168.0.5"
                value={formData.ipAddress}
                onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subnet-mask">Subnet Mask</Label>
              <Input
                id="subnet-mask"
                value="255.255.255.0"
                disabled
                className="bg-muted cursor-not-allowed"
              />
            </div>
          </div>

          {/* Slave Address */}
          <div className="space-y-2">
            <Label htmlFor="slave-address">Modbus Slave Address (0-255)</Label>
            <Input
              id="slave-address"
              type="number"
              min="0"
              max="255"
              placeholder="1"
              value={formData.slaveAddress}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                const clampedValue = Math.max(0, Math.min(255, value));
                setFormData(prev => ({ ...prev, slaveAddress: clampedValue }));
              }}
            />
            <p className="text-xs text-muted-foreground">
              Modbus unit/slave ID (typically 1-247, default: 1)
            </p>
          </div>

          {/* Connection Test */}
          <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <Label>Connection Test</Label>
              <Badge className={getPingStatusColor()}>
                {getPingStatusIcon()}
                <span className="ml-2">
                  {pingStatus === 'idle' && 'Not tested'}
                  {pingStatus === 'testing' && 'Testing...'}
                  {pingStatus === 'success' && 'Connected'}
                  {pingStatus === 'failed' && 'Failed'}
                </span>
              </Badge>
            </div>
            <Button 
              variant="outline" 
              onClick={handlePingTest}
              disabled={pingStatus === 'testing' || !formData.ipAddress}
              className="w-full"
            >
              {pingStatus === 'testing' ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
          </div>

          {/* Parameter Mapping Upload Section */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-semibold">Parameter/Register Mapping (Optional)</Label>
                <p className="text-sm text-muted-foreground">
                  Upload an Excel file to map parameters to register addresses
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
              >
                <Download className="w-4 h-4 mr-2" />
                Template
              </Button>
            </div>

            {/* File Upload */}
            {!excelFile ? (
              <div className="space-y-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                />
                <p className="text-xs text-muted-foreground">
                  Upload Excel file with Parameter and Address columns
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 border rounded bg-muted/50">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">{excelFile.name}</span>
                    <Badge variant="secondary">{parameterMappings.length} mappings</Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription className="whitespace-pre-wrap text-sm">{uploadError}</AlertDescription>
              </Alert>
            )}

            {/* Parameter Mappings Preview */}
            {parameterMappings.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Parameter Mappings Preview</CardTitle>
                  <CardDescription>
                    {parameterMappings.length} parameter(s) mapped
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parameter</TableHead>
                          <TableHead>Register Address</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parameterMappings.map((mapping, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{mapping.parameter}</TableCell>
                            <TableCell className="text-muted-foreground">{mapping.address}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            setParameterMappings([]);
            setExcelFile(null);
            setUploadError(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!formData.name || !formData.ipAddress || isSubmitting}
            className="bg-gradient-to-r from-primary to-primary-glow"
          >
            {isSubmitting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Adding Device...
              </>
            ) : (
              'Add Device'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
