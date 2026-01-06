"""
GPU-Accelerated Statistics Calculator
Uses CuPy (GPU-accelerated NumPy) for parallel computation of statistics on large datasets.

Requirements:
    pip install cupy-cuda12x  # For CUDA 12.x (adjust version as needed)
    # Or: pip install cupy-cuda11x  # For CUDA 11.x
"""

import sys
import json
import numpy as np

try:
    import cupy as cp
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False
    print("WARNING: CuPy not available, falling back to NumPy", file=sys.stderr)


def calculate_stats_gpu(data_array, use_gpu=True):
    """
    Calculate statistics using GPU acceleration.
    
    Args:
        data_array: List or numpy array of numeric values
        use_gpu: Whether to use GPU (if available)
    
    Returns:
        Dictionary with min, max, avg, std, count, median, q25, q75
    """
    if not data_array or len(data_array) == 0:
        return {
            'min': None,
            'max': None,
            'avg': None,
            'std': None,
            'count': 0,
            'median': None,
            'q25': None,
            'q75': None
        }
    
    # Convert to numpy array first
    np_array = np.asarray(data_array, dtype=np.float64)
    
    # Filter out NaN and Inf values
    np_array = np_array[np.isfinite(np_array)]
    
    if len(np_array) == 0:
        return {
            'min': None,
            'max': None,
            'avg': None,
            'std': None,
            'count': 0,
            'median': None,
            'q25': None,
            'q75': None
        }
    
    if GPU_AVAILABLE and use_gpu:
        try:
            # Transfer to GPU
            gpu_array = cp.asarray(np_array)
            
            # Calculate statistics on GPU
            stats = {
                'min': float(cp.min(gpu_array)),
                'max': float(cp.max(gpu_array)),
                'avg': float(cp.mean(gpu_array)),
                'std': float(cp.std(gpu_array)),
                'count': int(len(gpu_array)),
                'median': float(cp.median(gpu_array)),
                'q25': float(cp.percentile(gpu_array, 25)),
                'q75': float(cp.percentile(gpu_array, 75))
            }
            
            return stats
        except Exception as e:
            print(f"GPU calculation failed, falling back to CPU: {e}", file=sys.stderr)
            # Fall through to CPU calculation
    
    # CPU fallback
    stats = {
        'min': float(np.min(np_array)),
        'max': float(np.max(np_array)),
        'avg': float(np.mean(np_array)),
        'std': float(np.std(np_array)),
        'count': int(len(np_array)),
        'median': float(np.median(np_array)),
        'q25': float(np.percentile(np_array, 25)),
        'q75': float(np.percentile(np_array, 75))
    }
    
    return stats


def calculate_multiple_stats_gpu(data_dict, use_gpu=True):
    """
    Calculate statistics for multiple arrays in parallel.
    
    Args:
        data_dict: Dictionary of {key: [values]} pairs
        use_gpu: Whether to use GPU (if available)
    
    Returns:
        Dictionary of {key: stats_dict} pairs
    """
    results = {}
    
    if GPU_AVAILABLE and use_gpu:
        try:
            # Process all arrays on GPU in parallel
            gpu_arrays = {}
            for key, values in data_dict.items():
                np_array = np.asarray(values, dtype=np.float64)
                np_array = np_array[np.isfinite(np_array)]
                if len(np_array) > 0:
                    gpu_arrays[key] = cp.asarray(np_array)
            
            # Calculate statistics for all arrays
            for key, gpu_array in gpu_arrays.items():
                results[key] = {
                    'min': float(cp.min(gpu_array)),
                    'max': float(cp.max(gpu_array)),
                    'avg': float(cp.mean(gpu_array)),
                    'std': float(cp.std(gpu_array)),
                    'count': int(len(gpu_array)),
                    'median': float(cp.median(gpu_array)),
                    'q25': float(cp.percentile(gpu_array, 25)),
                    'q75': float(cp.percentile(gpu_array, 75))
                }
            
            return results
        except Exception as e:
            print(f"GPU parallel calculation failed, falling back to CPU: {e}", file=sys.stderr)
    
    # CPU fallback
    for key, values in data_dict.items():
        results[key] = calculate_stats_gpu(values, use_gpu=False)
    
    return results


def aggregate_time_series_gpu(timestamps, values, interval_seconds, use_gpu=True):
    """
    Aggregate time-series data into buckets using GPU.
    
    Args:
        timestamps: List of timestamps (Unix epoch seconds)
        values: List of corresponding values
        interval_seconds: Bucket size in seconds
        use_gpu: Whether to use GPU (if available)
    
    Returns:
        Dictionary with aggregated data: {bucket_start: {min, max, avg, count}}
    """
    if not timestamps or not values or len(timestamps) != len(values):
        return {}
    
    # Convert to numpy arrays
    ts_array = np.asarray(timestamps, dtype=np.float64)
    val_array = np.asarray(values, dtype=np.float64)
    
    # Filter out invalid values
    valid_mask = np.isfinite(val_array)
    ts_array = ts_array[valid_mask]
    val_array = val_array[valid_mask]
    
    if len(ts_array) == 0:
        return {}
    
    # Calculate bucket indices
    min_time = np.min(ts_array)
    bucket_indices = ((ts_array - min_time) / interval_seconds).astype(np.int32)
    
    if GPU_AVAILABLE and use_gpu:
        try:
            # Transfer to GPU
            gpu_vals = cp.asarray(val_array)
            gpu_buckets = cp.asarray(bucket_indices)
            
            # Get unique buckets
            unique_buckets = cp.unique(gpu_buckets)
            
            # Aggregate by bucket
            results = {}
            for bucket_idx in unique_buckets:
                bucket_mask = gpu_buckets == bucket_idx
                bucket_vals = gpu_vals[bucket_mask]
                
                bucket_start = int(min_time + float(bucket_idx) * interval_seconds)
                results[bucket_start] = {
                    'min': float(cp.min(bucket_vals)),
                    'max': float(cp.max(bucket_vals)),
                    'avg': float(cp.mean(bucket_vals)),
                    'count': int(len(bucket_vals))
                }
            
            return results
        except Exception as e:
            print(f"GPU aggregation failed, falling back to CPU: {e}", file=sys.stderr)
    
    # CPU fallback
    unique_buckets = np.unique(bucket_indices)
    results = {}
    for bucket_idx in unique_buckets:
        bucket_mask = bucket_indices == bucket_idx
        bucket_vals = val_array[bucket_mask]
        
        bucket_start = int(min_time + int(bucket_idx) * interval_seconds)
        results[bucket_start] = {
            'min': float(np.min(bucket_vals)),
            'max': float(np.max(bucket_vals)),
            'avg': float(np.mean(bucket_vals)),
            'count': int(len(bucket_vals))
        }
    
    return results


# Command-line interface
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command specified'}))
        sys.exit(1)
    
    command = sys.argv[1]
    
    try:
        if command == 'stats':
            # Calculate statistics for a single array
            # Usage: python gpu_stats.py stats '[1,2,3,4,5]'
            data = json.loads(sys.argv[2])
            result = calculate_stats_gpu(data)
            print(json.dumps(result))
        
        elif command == 'multi_stats':
            # Calculate statistics for multiple arrays
            # Usage: python gpu_stats.py multi_stats '{"param1": [1,2,3], "param2": [4,5,6]}'
            data_dict = json.loads(sys.argv[2])
            result = calculate_multiple_stats_gpu(data_dict)
            print(json.dumps(result))
        
        elif command == 'aggregate':
            # Aggregate time-series data
            # Usage: python gpu_stats.py aggregate '[1000,2000,3000]' '[1,2,3]' 1000
            timestamps = json.loads(sys.argv[2])
            values = json.loads(sys.argv[3])
            interval = int(sys.argv[4])
            result = aggregate_time_series_gpu(timestamps, values, interval)
            print(json.dumps(result))
        
        elif command == 'check':
            # Check GPU availability
            result = {
                'gpu_available': GPU_AVAILABLE,
                'cupy_version': None,
                'cuda_version': None
            }
            if GPU_AVAILABLE:
                try:
                    result['cupy_version'] = cp.__version__
                    result['cuda_version'] = cp.cuda.runtime.runtimeGetVersion()
                except:
                    pass
            print(json.dumps(result))
        
        else:
            print(json.dumps({'error': f'Unknown command: {command}'}))
            sys.exit(1)
    
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

