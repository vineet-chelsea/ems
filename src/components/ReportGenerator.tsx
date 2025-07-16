import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Calendar as CalendarIcon, FileText, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Device } from "./EnergyDashboard";

interface Parameter {
  key: string;
  label: string;
  unit: string;
  group: string;
}

interface ReportGeneratorProps {
  device: Device;
  availableParameters: Parameter[];
}

export function ReportGenerator({ device, availableParameters }: ReportGeneratorProps) {
  const [selectedParameters, setSelectedParameters] = useState<string[]>(['Ptotal']);
  const [reportFormat, setReportFormat] = useState<'pdf' | 'csv' | 'excel'>('pdf');
  const [dateRange, setDateRange] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [reportName, setReportName] = useState(`${device.name}_energy_report`);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleParameterToggle = (paramKey: string) => {
    setSelectedParameters(prev => 
      prev.includes(paramKey) 
        ? prev.filter(p => p !== paramKey)
        : [...prev, paramKey]
    );
  };

  const getDateRangeLabel = () => {
    const today = new Date();
    switch (dateRange) {
      case 'day':
        return format(today, 'PPP');
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        return `${format(weekStart, 'PPP')} - ${format(today, 'PPP')}`;
      case 'month':
        const monthStart = new Date(today);
        monthStart.setDate(1);
        return `${format(monthStart, 'PPP')} - ${format(today, 'PPP')}`;
      case 'custom':
        if (startDate && endDate) {
          return `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
        }
        return 'Select custom range';
      default:
        return '';
    }
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    
    // Simulate report generation
    setTimeout(() => {
      // In a real implementation, this would:
      // 1. Fetch historical data for selected parameters
      // 2. Generate the report in the selected format
      // 3. Download the file
      
      const fileName = `${reportName}_${format(new Date(), 'yyyy-MM-dd')}.${reportFormat}`;
      
      // Create a mock download
      const element = document.createElement('a');
      element.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent('Mock report data');
      element.download = fileName;
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      
      setIsGenerating(false);
    }, 2000);
  };

  const groupedParameters = availableParameters.reduce((groups, param) => {
    const group = param.group;
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(param);
    return groups;
  }, {} as Record<string, Parameter[]>);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Generate Energy Report
          </CardTitle>
          <CardDescription>
            Create detailed reports with historical data for selected parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Report Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Report Name */}
            <div className="space-y-2">
              <Label>Report Name</Label>
              <Input
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Enter report name"
              />
            </div>

            {/* Report Format */}
            <div className="space-y-2">
              <Label>Report Format</Label>
              <Select value={reportFormat} onValueChange={(value: 'pdf' | 'csv' | 'excel') => setReportFormat(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF Report</SelectItem>
                  <SelectItem value="csv">CSV Data</SelectItem>
                  <SelectItem value="excel">Excel Spreadsheet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="space-y-4">
            <Label>Date Range</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(['day', 'week', 'month', 'custom'] as const).map((range) => (
                <Button
                  key={range}
                  variant={dateRange === range ? 'default' : 'outline'}
                  onClick={() => setDateRange(range)}
                  className="capitalize"
                >
                  {range === 'day' && 'Today'}
                  {range === 'week' && 'Last 7 Days'}
                  {range === 'month' && 'Last 30 Days'}
                  {range === 'custom' && 'Custom Range'}
                </Button>
              ))}
            </div>

            {/* Custom Date Range */}
            {dateRange === 'custom' && (
              <div className="flex gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[240px] justify-start text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-[240px] justify-start text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Selected range: {getDateRangeLabel()}
            </div>
          </div>

          {/* Parameter Selection */}
          <div className="space-y-4">
            <Label>Select Parameters to Include</Label>
            <div className="space-y-4">
              {Object.entries(groupedParameters).map(([groupName, parameters]) => (
                <div key={groupName} className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    {groupName}
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pl-4">
                    {parameters.map((param) => (
                      <div key={param.key} className="flex items-center space-x-2">
                        <Checkbox
                          id={param.key}
                          checked={selectedParameters.includes(param.key)}
                          onCheckedChange={() => handleParameterToggle(param.key)}
                        />
                        <Label htmlFor={param.key} className="text-sm leading-none">
                          {param.label}
                          {param.unit && <span className="text-muted-foreground"> ({param.unit})</span>}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedParameters.length} parameter(s) selected
            </div>
            <Button
              onClick={handleGenerateReport}
              disabled={selectedParameters.length === 0 || isGenerating}
              className="bg-gradient-to-r from-primary to-primary-glow"
            >
              {isGenerating ? (
                <>
                  <BarChart3 className="w-4 h-4 mr-2 animate-pulse" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report Preview */}
      {selectedParameters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Report Preview</CardTitle>
            <CardDescription>Preview of your report configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Device:</span> {device.name}
                </div>
                <div>
                  <span className="font-medium">Format:</span> {reportFormat.toUpperCase()}
                </div>
                <div>
                  <span className="font-medium">Date Range:</span> {getDateRangeLabel()}
                </div>
                <div>
                  <span className="font-medium">Parameters:</span> {selectedParameters.length} selected
                </div>
              </div>
              
              <div className="space-y-2">
                <span className="font-medium text-sm">Included Parameters:</span>
                <div className="flex flex-wrap gap-2">
                  {selectedParameters.map((paramKey) => {
                    const param = availableParameters.find(p => p.key === paramKey);
                    return param ? (
                      <span
                        key={paramKey}
                        className="px-2 py-1 bg-primary/10 text-primary rounded text-xs"
                      >
                        {param.label}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}