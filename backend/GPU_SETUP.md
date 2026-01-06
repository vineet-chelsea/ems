# GPU Acceleration Setup Guide

Quick setup guide for GPU acceleration using Python/CuPy.

## Prerequisites

1. **NVIDIA GPU** (you have: RTX 5060 Ti 8GB ✅)
2. **CUDA Toolkit** (11.0 or higher)
3. **Python 3.8+** (already installed)
4. **CuPy** (GPU-accelerated NumPy)

## Installation

### Step 1: Install CUDA Toolkit

1. Download CUDA Toolkit from: https://developer.nvidia.com/cuda-downloads
2. Choose Windows → x86_64 → 10/11 → exe (local)
3. Run installer and choose "Express Installation"
4. Verify installation:
   ```powershell
   nvcc --version
   nvidia-smi
   ```

### Step 2: Install CuPy

Choose the version matching your CUDA version:

**For CUDA 12.x:**
```powershell
pip install cupy-cuda12x
```

**For CUDA 11.x:**
```powershell
pip install cupy-cuda11x
```

**Verify installation:**
```powershell
python -c "import cupy as cp; print('CuPy version:', cp.__version__); print('CUDA version:', cp.cuda.runtime.runtimeGetVersion())"
```

### Step 3: Test GPU Service

```powershell
cd backend
python scripts/gpu_stats.py check
```

You should see:
```json
{"gpu_available": true, "cupy_version": "12.x.x", "cuda_version": 12000}
```

## Configuration

Add to `backend/.env`:

```env
# GPU Acceleration
GPU_ENABLED=true
GPU_USE_FOR_REPORTS=true
GPU_USE_FOR_STATISTICS=true
GPU_MIN_ROWS=100000
```

## Usage

The GPU acceleration is automatically used when:
- `GPU_ENABLED=true`
- Dataset has more than `GPU_MIN_ROWS` rows (default: 100,000)
- Report generation or statistics calculation is requested

The system will automatically fall back to CPU if:
- GPU is not available
- CuPy is not installed
- Dataset is too small
- GPU calculation fails

## Performance

### Expected Speedups (RTX 5060 Ti)

- **Large aggregations (>1M rows):** 10-30x faster
- **Multiple parameter statistics:** 5-15x faster
- **Time-series aggregation:** 8-20x faster
- **Small datasets (<100k rows):** May be slower (GPU overhead)

### When GPU is Used

✅ **Automatic GPU acceleration for:**
- Power Quality Reports with >100k rows
- Statistics calculations on large datasets
- Multiple parameter aggregations

❌ **CPU fallback for:**
- Small datasets (<100k rows)
- Simple queries
- When GPU is unavailable

## Troubleshooting

### "CuPy not available"

1. Check CUDA is installed:
   ```powershell
   nvcc --version
   ```

2. Check CuPy installation:
   ```powershell
   pip list | Select-String cupy
   ```

3. Reinstall CuPy:
   ```powershell
   pip uninstall cupy-cuda12x
   pip install cupy-cuda12x
   ```

### "GPU calculation failed"

- Check NVIDIA drivers are up to date
- Verify GPU is detected: `nvidia-smi`
- Check CUDA version matches CuPy version
- System will automatically fall back to CPU

### Performance Issues

- **GPU slower than CPU:** Normal for small datasets (<100k rows)
- **Memory errors:** Reduce `GPU_MIN_ROWS` or process in smaller batches
- **Driver crashes:** Update NVIDIA drivers

## Monitoring

Check GPU usage:
```powershell
nvidia-smi -l 1
```

Check if GPU is being used:
- Look for "Using GPU acceleration" in backend logs
- Monitor GPU utilization with `nvidia-smi`

## Next Steps

1. Install CUDA Toolkit
2. Install CuPy
3. Test with `python scripts/gpu_stats.py check`
4. Configure in `.env`
5. Restart backend
6. Generate a large report to see GPU acceleration in action

## Notes

- GPU acceleration is optional - system works fine without it
- Automatic CPU fallback ensures reliability
- Best performance on datasets >1M rows
- RTX 5060 Ti 8GB is well-suited for this workload

