# GPU Setup Verification Script
# Checks if GPU acceleration is properly configured

Write-Host "GPU Acceleration Setup Check" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan
Write-Host ""

$gpuAvailable = $false
$cupyInstalled = $false
$cudaInstalled = $false

# Check for NVIDIA GPU
Write-Host "Checking for NVIDIA GPU..." -ForegroundColor Yellow
try {
    $nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if ($nvidiaSmi) {
        $gpuInfo = nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ NVIDIA GPU detected" -ForegroundColor Green
            Write-Host "    $gpuInfo" -ForegroundColor Gray
            $gpuAvailable = $true
        } else {
            Write-Host "  ✗ NVIDIA GPU not detected or drivers not installed" -ForegroundColor Red
        }
    } else {
        Write-Host "  ✗ nvidia-smi not found. NVIDIA drivers may not be installed." -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ Error checking GPU: $_" -ForegroundColor Red
}

Write-Host ""

# Check for CUDA
Write-Host "Checking for CUDA Toolkit..." -ForegroundColor Yellow
try {
    $nvcc = Get-Command nvcc -ErrorAction SilentlyContinue
    if ($nvcc) {
        $cudaVersion = nvcc --version 2>&1 | Select-String "release" | ForEach-Object { $_ -match "release (\d+\.\d+)" | Out-Null; $matches[1] }
        if ($cudaVersion) {
            Write-Host "  ✓ CUDA Toolkit installed: Version $cudaVersion" -ForegroundColor Green
            $cudaInstalled = $true
        } else {
            Write-Host "  ⚠ CUDA Toolkit found but version could not be determined" -ForegroundColor Yellow
            $cudaInstalled = $true
        }
    } else {
        Write-Host "  ✗ CUDA Toolkit not found" -ForegroundColor Red
        Write-Host "    Download from: https://developer.nvidia.com/cuda-downloads" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ✗ Error checking CUDA: $_" -ForegroundColor Red
}

Write-Host ""

# Check for CuPy
Write-Host "Checking for CuPy (Python GPU library)..." -ForegroundColor Yellow
try {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        $cupyCheck = python -c "import cupy; print(cupy.__version__)" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ CuPy installed: Version $cupyCheck" -ForegroundColor Green
            $cupyInstalled = $true
        } else {
            Write-Host "  ✗ CuPy not installed" -ForegroundColor Red
            Write-Host "    Install with: pip install cupy-cuda12x" -ForegroundColor Gray
            Write-Host "    (or cupy-cuda11x for CUDA 11.x)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✗ Python not found" -ForegroundColor Red
    }
} catch {
    Write-Host "  ✗ Error checking CuPy: $_" -ForegroundColor Red
}

Write-Host ""

# Test GPU functionality
Write-Host "Testing GPU functionality..." -ForegroundColor Yellow
try {
    Push-Location backend
    $gpuTest = python scripts/gpu_stats.py check 2>&1
    $gpuResult = $gpuTest | ConvertFrom-Json -ErrorAction SilentlyContinue
    
    if ($gpuResult -and $gpuResult.gpu_available) {
        Write-Host "  ✓ GPU acceleration is working!" -ForegroundColor Green
        if ($gpuResult.cupy_version) {
            Write-Host "    CuPy version: $($gpuResult.cupy_version)" -ForegroundColor Gray
        }
        if ($gpuResult.cuda_version) {
            Write-Host "    CUDA version: $($gpuResult.cuda_version)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ✗ GPU acceleration is not available" -ForegroundColor Red
        Write-Host "    System will use CPU fallback" -ForegroundColor Gray
    }
    Pop-Location
} catch {
    Write-Host "  ✗ Error testing GPU: $_" -ForegroundColor Red
    Pop-Location
}

Write-Host ""
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "=======" -ForegroundColor Cyan

if ($gpuAvailable -and $cudaInstalled -and $cupyInstalled) {
    Write-Host "✓ All GPU components are installed and ready!" -ForegroundColor Green
    Write-Host ""
    Write-Host "GPU acceleration will be used for:" -ForegroundColor White
    Write-Host "  - Large report generation (>100k rows)" -ForegroundColor Gray
    Write-Host "  - Statistics calculations on large datasets" -ForegroundColor Gray
    Write-Host "  - Multiple parameter aggregations" -ForegroundColor Gray
} else {
    Write-Host "⚠ GPU acceleration is not fully configured" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Missing components:" -ForegroundColor White
    if (-not $gpuAvailable) {
        Write-Host "  - NVIDIA GPU or drivers" -ForegroundColor Red
    }
    if (-not $cudaInstalled) {
        Write-Host "  - CUDA Toolkit" -ForegroundColor Red
        Write-Host "    Download: https://developer.nvidia.com/cuda-downloads" -ForegroundColor Gray
    }
    if (-not $cupyInstalled) {
        Write-Host "  - CuPy library" -ForegroundColor Red
        Write-Host "    Install: pip install cupy-cuda12x" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host 'Note: The system will work without GPU acceleration using CPU fallback.' -ForegroundColor Gray
    Write-Host '      See backend/GPU_SETUP.md for detailed setup instructions.' -ForegroundColor Gray
}

Write-Host ""
