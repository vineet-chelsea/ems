import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Download, Calendar as CalendarIcon, FileText, BarChart3 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Device } from "./EnergyDashboard";
import { api } from "@/services/api";
import { formatIST, APP_TIMEZONE } from "@/utils/timezone";
import * as XLSX from "xlsx";

interface Parameter {
  key: string;
  label: string;
  unit: string;
  group: string;
  columnName?: string;
}

interface ReportGeneratorProps {
  device: Device;
  availableParameters: Parameter[];
}

type ReportType = 'energy' | 'power-quality';

export function ReportGenerator({ device, availableParameters }: ReportGeneratorProps) {
  // Power Quality Report is available for MICROLOGIC_6E, PM8000, PM5320 (PM513x,PM532x,PM53xx), and EM6400
  const supportsPowerQuality = ['MICROLOGIC_6E', 'PM8000', 'PM5320', 'EM6400'].includes(device.type);
  const [reportType, setReportType] = useState<ReportType>('energy');
  const [selectedParameters, setSelectedParameters] = useState<string[]>(['Ptotal']);
  const [reportFormat, setReportFormat] = useState<'pdf' | 'csv' | 'xlsx' | 'html'>('pdf');
  const [dateRange, setDateRange] = useState<'day' | 'week' | 'month' | 'custom'>('day');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState<string>('00:00');
  const [endTime, setEndTime] = useState<string>('23:59');
  const [reportName, setReportName] = useState(`${device.name}_${supportsPowerQuality ? 'power_quality' : 'energy'}_report`);
  const [isGenerating, setIsGenerating] = useState(false);

  // When switching to custom range, ensure we have valid dates
  useEffect(() => {
    if (dateRange === 'custom' && (!startDate || !endDate)) {
      const today = new Date();
      if (!startDate) setStartDate(today);
      if (!endDate) setEndDate(today);
    }
  }, [dateRange]);

  const handleParameterToggle = (paramKey: string) => {
    setSelectedParameters(prev => 
      prev.includes(paramKey) 
        ? prev.filter(p => p !== paramKey)
        : [...prev, paramKey]
    );
  };

  const formatDateIST = (date: Date, formatStr: string = 'PPP'): string => {
    return date.toLocaleDateString('en-IN', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTimeIST = (date: Date): string => {
    return date.toLocaleString('en-IN', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const getDateRangeLabel = () => {
    const today = new Date();
    switch (dateRange) {
      case 'day':
        const dayStart = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return `${formatDateIST(dayStart)} - ${formatDateIST(today)} (last 24 hours)`;
      case 'week':
        const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return `${formatDateIST(weekStart)} - ${formatDateIST(today)} (last 7 days)`;
      case 'month':
        const monthStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return `${formatDateIST(monthStart)} - ${formatDateIST(today)} (last 30 days)`;
      case 'custom':
        if (startDate && endDate) {
          const { startTime: st, endTime: et } = computeRange();
          return `${formatDateTimeIST(st)} - ${formatDateTimeIST(et)}`;
        }
        return 'Select start and end date';
      default:
        return '';
    }
  };

  const computeRange = (): { startTime: Date; endTime: Date } => {
    const now = new Date();
    let startTimeDate: Date;
    switch (dateRange) {
      case 'day':
        startTimeDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startTimeDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startTimeDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        if (startDate) {
          const [startHour = 0, startMinute = 0] = startTime.split(':').map(Number);
          startTimeDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), startHour, startMinute, 0, 0);
        } else {
          startTimeDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        break;
      default:
        startTimeDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    let endTimeDate: Date;
    if (dateRange === 'custom' && endDate) {
      const [endHour = 23, endMinute = 59] = endTime.split(':').map(Number);
      endTimeDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), endHour, endMinute, 59, 999);
    } else {
      endTimeDate = now;
    }
    if (dateRange === 'custom' && endTimeDate < startTimeDate) {
      endTimeDate = new Date(startTimeDate.getTime());
      endTimeDate.setHours(23, 59, 59, 999);
    }
    return { startTime: startTimeDate, endTime: endTimeDate };
  };

  // Calculate dynamic limit based on number of columns and ~300MB file size
  const calculateMaxRows = (numColumns: number, format: 'pdf' | 'csv' | 'xlsx' | 'html'): number => {
    // Estimate bytes per row based on format
    // CSV: timestamp (~20 bytes) + (numColumns * ~15 bytes avg per value) + newline (2 bytes)
    // XLSX: ~50 bytes overhead per cell + data
    // PDF: ~100 bytes per row (compressed)
    // HTML: ~200 bytes per row (with tags)
    
    const maxFileSizeBytes = 300 * 1024 * 1024; // 300 MB
    
    let bytesPerRow: number;
    switch (format) {
      case 'csv':
        bytesPerRow = 20 + (numColumns * 15) + 2; // timestamp + columns + newline
        break;
      case 'xlsx':
        bytesPerRow = 50 + (numColumns * 30); // Excel overhead + data
        break;
      case 'html':
        bytesPerRow = 200 + (numColumns * 25); // HTML tags + data
        break;
      case 'pdf':
        bytesPerRow = 100 + (numColumns * 20); // PDF compressed
        break;
      default:
        bytesPerRow = 50 + (numColumns * 20);
    }
    
    // Add metadata overhead (headers, etc.) - estimate 5KB
    const metadataOverhead = 5 * 1024;
    const availableBytes = maxFileSizeBytes - metadataOverhead;
    
    const maxRows = Math.floor(availableBytes / bytesPerRow);
    
    // Safety: minimum 1000 rows, maximum 10 million rows
    return Math.max(1000, Math.min(maxRows, 10_000_000));
  };

  // Fetch real data for each selected parameter
  const fetchReportData = async () => {
    const { startTime, endTime } = computeRange();
    const rows: Array<{ originalTimestamp: string; timestamp: string; parameter: string; value: number | null; unit: string }> = [];

    // Calculate max rows based on selected parameters and format
    const numColumns = selectedParameters.length + 1; // +1 for timestamp column
    const maxRows = calculateMaxRows(numColumns, reportFormat);
    
    console.log(`Calculated max rows: ${maxRows} for ${numColumns} columns in ${reportFormat} format`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H1',location:'ReportGenerator.tsx:fetchReportData',message:'fetchReportData start',data:{deviceId:device.id,selectedParams:selectedParameters.length,startTime:startTime.toISOString(),endTime:endTime.toISOString(),requestedLimit:maxRows,dateRange},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    for (const paramKey of selectedParameters) {
      const param = availableParameters.find(p => p.key === paramKey);
      if (!param) continue;
      try {
        const resp = await api.getParameterTimeSeries(device.id, param.columnName || param.key, {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          limit: maxRows, // Use calculated limit
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H4',location:'ReportGenerator.tsx:fetchReportData',message:'API response received',data:{paramKey,paramLabel:param.label,dataPoints:resp.data?.length||0,requestedLimit:2000},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        (resp.data || []).forEach((point: { timestamp: string; value: number | null }) => {
          // Format timestamp to IST with consistent format
          const istTimestamp = formatIST(point.timestamp);
          
          rows.push({
            originalTimestamp: point.timestamp, // Keep original for deduplication
            timestamp: istTimestamp,
            parameter: param.label,
            value: point.value,
            unit: param.unit,
          });
        });
      } catch (e) {
        console.warn('Failed to fetch data for param', paramKey, e);
      }
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'ReportGenerator.tsx:fetchReportData',message:'before deduplication',data:{totalRows:rows.length,uniqueTimestamps:new Set(rows.map(r=>r.originalTimestamp)).size,uniqueParams:new Set(rows.map(r=>r.parameter)).size},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Remove duplicate entries using original timestamp (before formatting)
    // Use a Map to track unique combinations - keep the latest value if duplicates exist
    const uniqueRows = new Map<string, typeof rows[0]>();
    let duplicateCount = 0;
    rows.forEach(row => {
      // Use original timestamp for deduplication to avoid formatting differences
      const key = `${row.originalTimestamp}_${row.parameter}`;
      // If duplicate exists, keep the one with a non-null value, or the latest one
      if (!uniqueRows.has(key)) {
        uniqueRows.set(key, row);
      } else {
        duplicateCount++;
        const existing = uniqueRows.get(key)!;
        // Prefer non-null values, or keep existing if both are null
        if (row.value !== null && existing.value === null) {
          uniqueRows.set(key, row);
        }
      }
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H3',location:'ReportGenerator.tsx:fetchReportData',message:'after deduplication',data:{totalRows:rows.length,uniqueRows:uniqueRows.size,duplicateCount},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Convert back to array, remove originalTimestamp, and sort by timestamp then parameter
    // Parse IST formatted timestamps (DD/MM/YYYY, HH:MM:SS) for comparison
    const beforeSort = Array.from(uniqueRows.values());
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5',location:'ReportGenerator.tsx:fetchReportData',message:'final rows before sort',data:{uniqueRowsCount:beforeSort.length,uniqueTimestamps:new Set(beforeSort.map(r=>r.timestamp)).size},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const sortedRows = beforeSort
      .map(({ originalTimestamp, ...row }) => row) // Remove originalTimestamp from output
      .sort((a, b) => {
        // Parse IST format: "DD/MM/YYYY, HH:MM:SS" or "DD/MM/YYYY HH:MM:SS"
        const parseISTTimestamp = (ts: string): number => {
          // Try to parse IST format first
          const match = ts.match(/(\d{2})\/(\d{2})\/(\d{4})[,\s]+(\d{2}):(\d{2}):(\d{2})/);
          if (match) {
            const [, day, month, year, hour, minute, second] = match;
            // Create date in IST timezone
            const dateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
            // Parse as if it's in IST (we'll compare the string representation)
            return new Date(dateStr + '+05:30').getTime();
          }
          // Fallback: try to parse as ISO string
          const isoDate = new Date(ts);
          if (!isNaN(isoDate.getTime())) {
            return isoDate.getTime();
          }
          // Last resort: return 0 (will sort to beginning)
          return 0;
        };
        
        const t = parseISTTimestamp(a.timestamp) - parseISTTimestamp(b.timestamp);
      if (t !== 0) return t;
      return a.parameter.localeCompare(b.parameter);
    });

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/773308c4-f8d6-49f7-8e8c-bcfa7cdf7678',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H5',location:'ReportGenerator.tsx:fetchReportData',message:'final result',data:{finalRowCount:sortedRows.length,uniqueTimestamps:new Set(sortedRows.map(r=>r.timestamp)).size,uniqueParams:new Set(sortedRows.map(r=>r.parameter)).size,expectedPointsFor24h:17280,expectedPointsFor7d:120960},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return sortedRows;
  };

  // Transform data from long format to wide format (pivot table)
  // Input: [{timestamp, parameter, value, unit}, ...]
  // Output: [{timestamp, param1, param2, ...}, ...]
  const pivotData = (data: Array<{ timestamp: string; parameter: string; value: number | null; unit: string }>) => {
    if (data.length === 0) return [];

    // Get all unique timestamps and parameters
    const timestamps = Array.from(new Set(data.map(row => row.timestamp))).sort();
    const parameters = Array.from(new Set(data.map(row => row.parameter))).sort();

    // Create a map for quick lookup: timestamp -> parameter -> value
    const dataMap = new Map<string, Map<string, number | null>>();
    data.forEach(row => {
      if (!dataMap.has(row.timestamp)) {
        dataMap.set(row.timestamp, new Map());
      }
      dataMap.get(row.timestamp)!.set(row.parameter, row.value);
    });

    // Build pivoted rows
    const pivotedRows = timestamps.map(timestamp => {
      const row: Record<string, string | number | null> = { Timestamp: timestamp };
      parameters.forEach(param => {
        const value = dataMap.get(timestamp)?.get(param) ?? null;
        row[param] = value;
      });
      return row;
    });

    return { pivotedRows, parameters };
  };

  const createCSVContent = (data: any[]) => {
    const meta = [
      `Device: ${device.name}`,
      `Date Range: ${getDateRangeLabel()}`,
      `Parameters: ${selectedParameters.length}`,
      `Data Points: ${data.length}`,
      ''
    ];
    if (data.length === 0) return meta.join('\n');
    
    // Pivot the data for single table format
    const { pivotedRows, parameters } = pivotData(data);
    const headers = ['Timestamp', ...parameters];
    const rows = pivotedRows.map(row => 
      headers.map(header => {
        const val = row[header];
        return val === null || val === undefined ? '' : String(val);
      }).join(',')
    );
    return [...meta, headers.join(','), ...rows].join('\n');
  };

  const createXLSXContent = (data: any[]): Blob => {
    const { pivotedRows, parameters } = pivotData(data);
    const headers = ['Timestamp', ...parameters];
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create metadata sheet
    const metadata = [
      ['Device', device.name],
      ['Date Range', getDateRangeLabel()],
      ['Parameters', selectedParameters.length],
      ['Data Points', data.length],
      ['Generated', formatDateTimeIST(new Date()) + ' (IST)'],
      [''],
      ['Selected Parameters'],
      ...selectedParameters.map(paramKey => {
        const param = availableParameters.find(p => p.key === paramKey);
        return param ? [param.label, param.unit] : [paramKey, ''];
      })
    ];
    const wsMeta = XLSX.utils.aoa_to_sheet(metadata);
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata');
    
    // Create data sheet
    const dataArray = [headers, ...pivotedRows.map(row => 
      headers.map(header => {
        const val = row[header];
        return val === null || val === undefined ? '' : val;
      })
    )];
    const wsData = XLSX.utils.aoa_to_sheet(dataArray);
    XLSX.utils.book_append_sheet(wb, wsData, 'Data');
    
    // Convert to blob
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  const createHTMLContent = (data: any[]): string => {
    const { pivotedRows, parameters } = pivotData(data);
    const headers = ['Timestamp', ...parameters];
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportName} - ${device.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
    .container { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    .metadata { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #4CAF50; }
    .metadata p { margin: 5px 0; }
    .metadata strong { color: #555; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; font-weight: bold; position: sticky; top: 0; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    tr:hover { background-color: #f1f1f1; }
    td { color: #333; }
    @media print {
      body { background-color: white; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Energy Monitoring Report</h1>
    <div class="metadata">
      <p><strong>Device:</strong> ${device.name}</p>
      <p><strong>Date Range:</strong> ${getDateRangeLabel()}</p>
      <p><strong>Parameters:</strong> ${selectedParameters.length}</p>
      <p><strong>Data Points:</strong> ${data.length}</p>
      <p><strong>Generated:</strong> ${formatDateTimeIST(new Date())} (IST)</p>
    </div>
    <table>
      <thead>
        <tr>
          ${headers.map(h => `<th>${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${pivotedRows.map(row => `
          <tr>
            ${headers.map(header => {
              const val = row[header];
              return `<td>${val === null || val === undefined ? '' : String(val)}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
    
    return html;
  };

  const createPDFContent = (data: any[]) => {
    const reportContent = `
ENERGY MONITORING REPORT
========================

Device: ${device.name}
Report Name: ${reportName}
Generated: ${formatDateTimeIST(new Date())} (IST)
Date Range: ${getDateRangeLabel()}
Parameters: ${selectedParameters.length} selected
Total Data Points: ${data.length}
Start: ${data.length ? data[0].timestamp : 'N/A'}
End: ${data.length ? data[data.length - 1].timestamp : 'N/A'}

SELECTED PARAMETERS:
${selectedParameters.map(paramKey => {
  const param = availableParameters.find(p => p.key === paramKey);
  return param ? `- ${param.label} (${param.unit})` : '';
}).filter(Boolean).join('\n')}

DATA SUMMARY:
${data.length > 0 ? `
First Reading: ${data[0].timestamp}
Last Reading: ${data[data.length - 1].timestamp}
Interval: 5 seconds
` : 'No data available'}

RAW DATA:
${data.slice(0, 100).map(row => 
  `${row.timestamp}: ${row.parameter}=${row.value}${row.unit ? ' ' + row.unit : ''}`
).join('\n')}

${data.length > 100 ? `\n... and ${data.length - 100} more records` : ''}
    `;
    
    return reportContent;
  };

  const generatePowerQualityReport = async () => {
    try {
      const { startTime, endTime } = computeRange();
      if (!startTime || !endTime) {
        throw new Error('Invalid date range. Please select a valid date range.');
      }
      
      if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
        throw new Error('Invalid date objects. Please select a valid date range.');
      }
      
      console.log('Generating Power Quality Report for device:', device.id, 'from', startTime, 'to', endTime);
      const reportData = await api.getPowerQualityReport(device.id, startTime.toISOString(), endTime.toISOString());
      console.log('Report data received:', reportData);
    
    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/[\/\s:]/g, '-').replace(/,/g, '');
    const fileName = `${reportName}_${timestamp}`;

    // Power Quality reports are always PDF
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const headerHeight = 60;
    const footerHeight = 40;
    const marginLeft = 50;
    const marginRight = 50;
    const marginTop = headerHeight + 10; // Space after header
    const marginBottom = footerHeight + 10; // Space before footer
    const contentWidth = pageWidth - marginLeft - marginRight;
    let y = marginTop;
    let pageNumber = 1;

    // Helper function to add new page
    const addNewPage = () => {
      doc.addPage();
      pageNumber++;
      addPageHeader();
      y = marginTop; // Start content below header
    };

    // Helper function to add page header
    const addPageHeader = () => {
      // Header background
      doc.setFillColor(33, 81, 126); // Primary blue
      doc.rect(0, 0, pageWidth, headerHeight, 'F');
      
      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('POWER QUALITY & ANALYSIS REPORT', pageWidth / 2, 35, { align: 'center' });
      
      // Page number
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Page ${pageNumber}`, pageWidth - marginRight, 50, { align: 'right' });
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
    };

    // Add first page header
    addPageHeader();

    // Report metadata box
    const metadataBoxHeight = 110;
    doc.setFillColor(240, 245, 250);
    doc.roundedRect(marginLeft, y, contentWidth, metadataBoxHeight, 3, 3, 'F');
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 81, 126);
    doc.text('Report Information', marginLeft + 12, y + 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    
    const metaLeft = marginLeft + 12;
    const metaRight = marginLeft + contentWidth / 2 + 10;
    let metaY = y + 38;
    const metaLineHeight = 16;
    
    // Left column
    const deviceNameText = doc.splitTextToSize(`Device Name: ${reportData.deviceName}`, contentWidth / 2 - 20);
    doc.text(deviceNameText, metaLeft, metaY);
    metaY += metaLineHeight * deviceNameText.length;
    
    const startTimeText = `Start Time: ${formatIST(new Date(reportData.startTime))}`;
    doc.text(startTimeText, metaLeft, metaY);
    metaY += metaLineHeight;
    
    const endTimeText = `End Time: ${formatIST(new Date(reportData.endTime))}`;
    doc.text(endTimeText, metaLeft, metaY);
    
    // Right column
    metaY = y + 38;
    const generatedText = `Generated: ${formatDateTimeIST(new Date())} (IST)`;
    const generatedLines = doc.splitTextToSize(generatedText, contentWidth / 2 - 20);
    doc.text(generatedLines, metaRight, metaY);
    metaY += metaLineHeight * generatedLines.length;
    
    const startDate = new Date(reportData.startTime);
    const endDate = new Date(reportData.endTime);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    doc.text(`Report Period: ${daysDiff} day${daysDiff !== 1 ? 's' : ''}`, metaRight, metaY);
    
    y += metadataBoxHeight + 15;

    // Helper function to safely format numbers
    const formatNumber = (value: number | null | undefined): string => {
      if (value === null || value === undefined || typeof value !== 'number' || !isFinite(value)) {
        return 'N/A';
      }
      return value.toFixed(2);
    };

    // Section Header Style
    const addSectionHeader = (title: string) => {
      // Check if we need a new page (account for header height + section header + some content)
      if (y > pageHeight - marginBottom - 50) {
        addNewPage();
      }
      
      doc.setFillColor(33, 81, 126);
      doc.roundedRect(marginLeft, y, contentWidth, 25, 3, 3, 'F');
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      // Split long titles if needed
      const titleLines = doc.splitTextToSize(title, contentWidth - 20);
      doc.text(titleLines, marginLeft + 10, y + 17);
      
      doc.setTextColor(0, 0, 0);
      y += 30 + (titleLines.length - 1) * 12;
    };

    // Energy Parameters Table
    addSectionHeader('ENERGY PARAMETERS');
    
    const energyTableData = [
      ['Parameter', 'Start Value', 'End Value', 'Difference', 'Unit'],
      [
        'Active Energy (Wh)',
        formatNumber(reportData.energyData.Wh.start),
        formatNumber(reportData.energyData.Wh.end),
        formatNumber(reportData.energyData.differences.Wh),
        'kWh'
      ],
      [
        'Reactive Energy (Varh)',
        formatNumber(reportData.energyData.Varh.start),
        formatNumber(reportData.energyData.Varh.end),
        formatNumber(reportData.energyData.differences.Varh),
        'kVArh'
      ],
      [
        'Apparent Energy (kVAh)',
        formatNumber(reportData.energyData.kVAh.start),
        formatNumber(reportData.energyData.kVAh.end),
        formatNumber(reportData.energyData.differences.kVAh),
        'kVAh'
      ],
    ];

    autoTable(doc, {
      startY: y,
      margin: { left: marginLeft, right: marginRight, top: marginTop, bottom: marginBottom },
      tableWidth: 'wrap',
      styles: { 
        fontSize: 9, 
        cellPadding: 5,
        font: 'helvetica',
        textColor: [0, 0, 0],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [33, 81, 126],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        overflow: 'linebreak',
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      head: [energyTableData[0]],
      body: energyTableData.slice(1),
      didDrawPage: (data: any) => {
        if (data.pageNumber > pageNumber) {
          pageNumber = data.pageNumber;
          addPageHeader();
          // Update y position after header is drawn
          y = marginTop;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 25;

    // Energy Charges Highlight Box
    if (reportData.energyData.energyCharges !== null && typeof reportData.energyData.energyCharges === 'number') {
      if (y > pageHeight - marginBottom - 70) {
        addNewPage();
      }
      
      const chargesBoxHeight = 55;
      doc.setFillColor(240, 248, 255);
      doc.setDrawColor(33, 81, 126);
      doc.setLineWidth(1);
      doc.roundedRect(marginLeft, y, contentWidth, chargesBoxHeight, 3, 3, 'FD');
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(33, 81, 126);
      doc.text('Energy Charges', marginLeft + 12, y + 18);
      
      doc.setFontSize(13);
      // Use 'Rs' instead of ₹ symbol to avoid encoding issues
      // Build text using string concatenation to avoid template literal encoding issues
      const energyChargesValue = formatNumber(reportData.energyData.energyCharges);
      doc.text('Rs ' + energyChargesValue, marginLeft + 12, y + 38);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      // Use 'x' instead of × symbol and 'Rs' instead of ₹ to avoid encoding issues
      // Handle unitCost - convert to number and check if valid
      let unitCostValue = 'Not Set';
      if (reportData.energyData.unitCost != null) {
        const unitCostNum = typeof reportData.energyData.unitCost === 'string' 
          ? parseFloat(reportData.energyData.unitCost) 
          : Number(reportData.energyData.unitCost);
        if (!isNaN(unitCostNum) && isFinite(unitCostNum) && unitCostNum > 0) {
          unitCostValue = unitCostNum.toFixed(2);
        }
      }
      console.log('[ReportGenerator] unitCost:', reportData.energyData.unitCost, 'type:', typeof reportData.energyData.unitCost, 'parsed:', unitCostValue);
      // Build text without using template literals to avoid any encoding issues
      const kVAhDiff = formatNumber(reportData.energyData.differences.kVAh);
      const calcText = 'kVAh diff: ' + kVAhDiff + ' x Unit: Rs' + unitCostValue;
      // Use direct text rendering instead of splitTextToSize to avoid encoding issues
      doc.text(calcText, marginLeft + contentWidth / 2, y + 25, { align: 'right', maxWidth: contentWidth / 2 - 10 });
      
      doc.setTextColor(0, 0, 0);
      y += chargesBoxHeight + 15;
    }

    // Max/Min Values Table
    addSectionHeader('MAXIMUM/MINIMUM VALUES');

    const maxMinTableData = [
      ['Parameter', 'Maximum', 'Max Time', 'Minimum', 'Min Time', 'Unit'],
    ];

    // Parameter display name mapping
    const getParamDisplayName = (param: string): string => {
      const displayNames: Record<string, string> = {
        'kW_Total': 'kW Total',
        'Active Power Total': 'Active Power Total',
        'Frequency': 'Frequency',
        'V_L-N_AVG': 'V L-N AVG',
        'Voltage L-N Avg': 'Voltage L-N Avg',
        'V_L-L_AVG': 'V L-L AVG',
        'Voltage L-L Avg': 'Voltage L-L Avg',
        'I_AVG': 'I AVG',
        'Current Avg': 'Current Avg',
        'S_Dmd_Peak': 'S Dmd Peak',
        'Apparent Power Total': 'Apparent Power Total',
        'Over Demand, Apparent Power, Last': 'Over Demand, Apparent Power, Last',
      };
      return displayNames[param] || param;
    };

    for (const [param, data] of Object.entries(reportData.maxMinData)) {
      maxMinTableData.push([
        getParamDisplayName(param),
        formatNumber(data.max),
        data.maxTime ? formatIST(new Date(data.maxTime)) : 'N/A',
        formatNumber(data.min),
        data.minTime ? formatIST(new Date(data.minTime)) : 'N/A',
        (data as any).unit || '', // Use unit from backend response
      ]);
    }

    autoTable(doc, {
      startY: y,
      margin: { left: marginLeft, right: marginRight, top: marginTop, bottom: marginBottom },
      styles: { 
        fontSize: 8, 
        cellPadding: 4,
        font: 'helvetica',
        textColor: [0, 0, 0],
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [33, 81, 126],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { cellWidth: 100, fontSize: 7, overflow: 'linebreak' }, // Parameter
        1: { cellWidth: 60, halign: 'right', fontSize: 8 }, // Maximum
        2: { cellWidth: 85, fontSize: 6, overflow: 'linebreak' }, // Max Time
        3: { cellWidth: 60, halign: 'right', fontSize: 8 }, // Minimum
        4: { cellWidth: 85, fontSize: 6, overflow: 'linebreak' }, // Min Time
        5: { cellWidth: 35, halign: 'center', fontSize: 7 }, // Unit
      },
      head: [maxMinTableData[0]],
      body: maxMinTableData.slice(1),
      didDrawPage: (data: any) => {
        if (data.pageNumber > pageNumber) {
          pageNumber = data.pageNumber;
          addPageHeader();
          // Update y position after header is drawn
          y = marginTop;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 25;

    // Events Table
    if (reportData.events.length > 0) {
      addSectionHeader(`EVENTS LOGGED DURING PERIOD (${reportData.events.length} Total)`);

      const eventsTableData = [
        ['Timestamp', 'Parameter', 'Event Type', 'Value', 'Description'],
        ...reportData.events.map(evt => [
          formatIST(new Date(evt.event_timestamp)),
          evt.parameter,
          evt.event_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          formatNumber(evt.new_value),
          evt.description || 'N/A',
        ]),
      ];

      // Calculate column widths to fit within content width
      const totalFixedWidth = 90 + 80 + 75 + 50; // Timestamp + Parameter + Event Type + Value
      const descriptionWidth = Math.max(100, contentWidth - totalFixedWidth - 20); // Ensure minimum 100pt for description
      
      autoTable(doc, {
        startY: y,
        margin: { left: marginLeft, right: marginRight, top: marginTop, bottom: marginBottom },
        tableWidth: 'wrap',
        styles: { 
          fontSize: 7, 
          cellPadding: 3,
          font: 'helvetica',
          textColor: [0, 0, 0],
          overflow: 'linebreak',
          cellWidth: 'wrap',
        },
        headStyles: {
          fillColor: [220, 53, 69], // Red for events
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          overflow: 'linebreak',
        },
        alternateRowStyles: {
          fillColor: [255, 245, 245],
        },
        columnStyles: {
          0: { cellWidth: 90, fontSize: 6 }, // Timestamp
          1: { cellWidth: 80, fontSize: 6 }, // Parameter
          2: { cellWidth: 75, fontSize: 6 }, // Event Type
          3: { cellWidth: 50, halign: 'right', fontSize: 7 }, // Value
          4: { cellWidth: descriptionWidth, fontSize: 6, cellPadding: 3 }, // Description
        },
        head: [eventsTableData[0]],
        body: eventsTableData.slice(1),
        didDrawPage: (data: any) => {
          if (data.pageNumber > pageNumber) {
            pageNumber = data.pageNumber;
            addPageHeader();
            // Update y position after header is drawn
            y = marginTop;
          }
        },
      });
    } else {
      // No events message
      if (y > pageHeight - marginBottom - 60) {
        addNewPage();
      }
      addSectionHeader('EVENTS LOGGED DURING PERIOD');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(150, 150, 150);
      doc.text('No events were logged during this period.', marginLeft + 12, y + 15);
      doc.setTextColor(0, 0, 0);
      y += 25;
    }

    // Footer on all pages
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      const footerText = `Generated on ${formatDateTimeIST(new Date())} (IST) | Page ${i} of ${totalPages}`;
      doc.text(
        footerText,
        pageWidth / 2,
        pageHeight - 15,
        { align: 'center', maxWidth: contentWidth }
      );
      // Footer line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, pageHeight - 25, pageWidth - marginRight, pageHeight - 25);
    }

    doc.save(`${fileName}.pdf`);
    } catch (err: any) {
      console.error('Error in generatePowerQualityReport:', err);
      throw err; // Re-throw to be caught by handleGenerateReport
    }
  };

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      if (reportType === 'power-quality' && supportsPowerQuality) {
        await generatePowerQualityReport();
        return;
      }

      const data = await fetchReportData();
      const timestamp = new Date().toLocaleString('en-IN', {
        timeZone: APP_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/[\/\s:]/g, '-').replace(/,/g, '');
      const fileName = `${reportName}_${timestamp}`;

      if (reportFormat === 'pdf') {
        // Generate a tabular PDF using jsPDF + autotable
        const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
        const marginLeft = 32;
        let y = 32;

        doc.setFontSize(12);
        doc.text('ENERGY MONITORING REPORT', marginLeft, y);
        y += 18;
        doc.setFontSize(10);
        const meta = [
          `Device: ${device.name}`,
          `Report Name: ${reportName}`,
          `Generated: ${formatDateTimeIST(new Date())} (IST)`,
          `Date Range: ${getDateRangeLabel()}`,
          `Parameters: ${selectedParameters.length} selected`,
          `Total Data Points: ${data.length}`,
          `Start: ${data.length ? data[0].timestamp : 'N/A'}`,
          `End: ${data.length ? data[data.length - 1].timestamp : 'N/A'}`
        ];
        meta.forEach(line => {
          doc.text(line, marginLeft, y);
          y += 14;
        });
        y += 8;

        // Pivot the data for single table format
        const { pivotedRows, parameters } = pivotData(data);
        
        // Build table with timestamp as first column, then each parameter as a column
        const headers = ['Timestamp', ...parameters];
        const tableBody = pivotedRows.map(row => 
          headers.map(header => {
            const val = row[header];
            if (val === null || val === undefined) return 'N/A';
            if (typeof val === 'number') {
              return isFinite(val) ? val.toFixed(3) : 'N/A';
            }
            return String(val);
          })
        );

        autoTable(doc, {
          startY: y,
          margin: { left: marginLeft, right: marginLeft },
          styles: { fontSize: 8, cellPadding: 3 },
          head: [headers],
          body: tableBody,
          didDrawPage: (dataCtx) => {
            // footer
            const str = `Page ${(doc as any).getNumberOfPages?.() || doc.getCurrentPageInfo().pageNumber}`;
            doc.setFontSize(8);
            doc.text(str, doc.internal.pageSize.getWidth() - marginLeft, doc.internal.pageSize.getHeight() - 12, { align: 'right' });
          },
        });

        doc.save(`${fileName}.pdf`);
      } else {
        let content = '';
        let mimeType = '';
        let extension = '';

        // Handle XLSX separately as it returns a Blob directly
        if (reportFormat === 'xlsx') {
          const xlsxBlob = createXLSXContent(data);
          const xlsxUrl = URL.createObjectURL(xlsxBlob);
          const xlsxElement = document.createElement('a');
          xlsxElement.href = xlsxUrl;
          xlsxElement.download = `${fileName}.xlsx`;
          xlsxElement.style.display = 'none';
          document.body.appendChild(xlsxElement);
          xlsxElement.click();
          document.body.removeChild(xlsxElement);
          URL.revokeObjectURL(xlsxUrl);
      } else {
        let content = '';
        let mimeType = '';
        let extension = '';

        switch (reportFormat) {
          case 'csv':
            content = createCSVContent(data);
            mimeType = 'text/csv';
            extension = 'csv';
            break;
            case 'html':
              content = createHTMLContent(data);
              mimeType = 'text/html';
              extension = 'html';
            break;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const element = document.createElement('a');
        element.href = url;
        element.download = `${fileName}.${extension}`;
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        URL.revokeObjectURL(url);
        }
      }
    } catch (err: any) {
      console.error('Failed to generate report:', err);
      alert(`Failed to generate report: ${err.message || 'Unknown error'}. Please check the console for details.`);
    } finally {
      setIsGenerating(false);
    }
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
            Generate Report
          </CardTitle>
          <CardDescription>
            {reportType === 'power-quality' 
              ? 'Create Power Quality and Analysis Report'
              : 'Create detailed reports with historical data for selected parameters'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Report Type Selection (for devices that support Power Quality reports) */}
          {supportsPowerQuality && (
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={(value: ReportType) => {
                setReportType(value);
                // Force PDF format for power quality reports
                if (value === 'power-quality') {
                  setReportFormat('pdf');
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="power-quality">Power Quality and Analysis Report</SelectItem>
                  <SelectItem value="energy">Energy Monitoring Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

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

            {/* Report Format - Only show for energy reports */}
            {reportType === 'energy' && (
              <div className="space-y-2">
                <Label>Report Format</Label>
                <Select value={reportFormat} onValueChange={(value: 'pdf' | 'csv' | 'xlsx' | 'html') => setReportFormat(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF Document</SelectItem>
                    <SelectItem value="csv">CSV File</SelectItem>
                    <SelectItem value="xlsx">Excel Spreadsheet (XLSX)</SelectItem>
                    <SelectItem value="html">HTML Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? formatDateIST(startDate) : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(d) => {
                            if (d) {
                              const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                              setStartDate(local);
                            } else {
                              setStartDate(undefined);
                            }
                          }}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? formatDateIST(endDate) : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(d) => {
                            if (d) {
                              const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                              setEndDate(local);
                            } else {
                              setEndDate(undefined);
                            }
                          }}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              Selected range: {getDateRangeLabel()}
            </div>
          </div>

          {/* Parameter Selection (only for energy report) */}
          {reportType === 'energy' && (
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
          )}

          {/* Generate Button */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {selectedParameters.length} parameter(s) selected
            </div>
            <Button
              onClick={handleGenerateReport}
              disabled={(reportType === 'energy' && selectedParameters.length === 0) || isGenerating}
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
                  <span className="font-medium">Format:</span> {reportType === 'power-quality' ? 'PDF' : reportFormat.toUpperCase()}
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