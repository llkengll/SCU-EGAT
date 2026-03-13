import numpy as np
import librosa
from scipy.signal import welch
from typing import Tuple, Optional

EPS = 1e-12

def resize_psd(psd: np.ndarray, target_bins: int) -> np.ndarray:
    """Resize psd to fixed bins with interpolation or padding."""
    if len(psd) > target_bins:
        x_old = np.arange(len(psd))
        x_new = np.linspace(0, len(psd) - 1, target_bins)
        return np.interp(x_new, x_old, psd)
    if len(psd) < target_bins:
        return np.pad(psd, (0, target_bins - len(psd)))
    return psd

def extract_psd(wav_path: str, sr: int, nperseg: int, nfft: int, n_freq_bins: int, use_log: bool = True, 
                for_plot: bool = False, global_mean: Optional[np.ndarray] = None, 
                global_std: Optional[np.ndarray] = None) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    """
    Extract Power Spectral Density from a WAV file.
     Returns (psd, freqs). 
     If for_plot is False, returns (normalized_psd, None).
    """
    try:
        y, _ = librosa.load(wav_path, sr=sr)
        freqs, psd = welch(y, fs=sr, nperseg=nperseg, nfft=nfft)
        psd = np.maximum(psd, EPS)

        if for_plot:
            psd_res = resize_psd(psd, n_freq_bins)
            plot_freqs = np.linspace(freqs[0], freqs[-1], n_freq_bins)
            return psd_res, plot_freqs

        if use_log:
            psd = np.log(psd + EPS)

        psd_norm = resize_psd(psd, n_freq_bins)

        if global_mean is not None and global_std is not None:
            std_safe = np.maximum(global_std, 1e-6)
            psd_norm = (psd_norm - global_mean) / std_safe
            psd_norm = np.clip(psd_norm, -100.0, 100.0)

        return psd_norm, None
    except Exception as e:
        print(f"PSD extraction error for {wav_path}: {e}")
        return None, None

def invert_model_psd(x_norm: np.ndarray, use_log: bool, global_mean: Optional[np.ndarray] = None, 
                     global_std: Optional[np.ndarray] = None) -> np.ndarray:
    """Convert model space (log + zscore) back to PSD linear distribution (sum=1)."""
    x = np.array(x_norm, dtype=np.float64).copy()

    if global_mean is not None and global_std is not None:
        x = x * global_std + global_mean

    if use_log:
        x = np.clip(x, -100.0, 50.0)
        x = np.exp(x)

    x = np.nan_to_num(x, nan=0.0)
    x = np.maximum(x, 0.0)
    x = x / (np.sum(x) + EPS)
    return x
