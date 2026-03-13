import os
import io
import pickle
import zipfile
import tempfile
import logging
from abc import ABC, abstractmethod
from collections import deque
from typing import Optional, Tuple, Dict, Any, List
import numpy as np
from app.core import features

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("PSDModel")

class AbstractPSDModel(ABC):
    def __init__(self, config: Dict[str, Any]):
        self.cfg = config
        self.model = None
        self.model_loaded = False
        self.init_message = "Ready. Please train or load a model."
        
        self.threshold = 0.0
        
        self.global_psd_mean = None
        self.global_psd_std = None

    @abstractmethod
    def _build_model(self, input_dim: int):
        pass

    @abstractmethod
    def _train_internal(self, feats: np.ndarray):
        pass

    @abstractmethod
    def _predict_internal(self, x: np.ndarray) -> np.ndarray:
        pass

    def get_config(self) -> Dict[str, Any]:
        return dict(self.cfg)

    def set_config(self, new_cfg: Dict[str, Any]) -> Tuple[bool, str]:
        old_cfg = dict(self.cfg)
        for k, v in new_cfg.items():
            if k in self.cfg:
                self.cfg[k] = v
        
        # Check if retrain is needed based on specific keys
        retrain_keys = ["SR", "N_FREQ_BINS", "AE_LATENT_DIM", "VAE_LATENT_DIM", "PCA_N_COMPONENTS"]
        need_retrain = any(old_cfg.get(k) != self.cfg.get(k) for k in retrain_keys if k in self.cfg)
        
        if need_retrain:
            self.model = None
            self.global_psd_mean = None
            self.global_psd_std = None
            self.threshold = 0.0
            return True, "Config updated (needs retrain)"
        
        return True, "Config updated"
        
    def get_active_threshold(self) -> float:
        """Returns the threshold actually used for detection (Manual override OR Auto)."""
        m_th = float(self.cfg.get("MANUAL_THRESHOLD", 0.0))
        if m_th > 0:
            return m_th
        return float(self.threshold)

    def save_bundle(self, bundle_path: str, model_kind: str) -> Tuple[bool, str]:
        if not self.model_loaded or self.model is None:
            return False, "Model not loaded"

        try:
            payload = {
                "kind": model_kind,
                "sr": self.cfg["SR"],
                "n_bins": self.cfg["N_FREQ_BINS"],
                "use_log": self.cfg["USE_LOG"],
                "thresholds": (
                    float(self.threshold),
                ),
                "global_psd_mean": self.global_psd_mean,
                "global_psd_std": self.global_psd_std,
                "cfg": self.cfg
            }

            with tempfile.TemporaryDirectory() as tmp:
                model_file = os.path.join(tmp, "model.keras")
                self._save_model_to_path(model_file)

                mem = io.BytesIO()
                with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as z:
                    z.write(model_file, arcname="model.keras")
                    z.writestr("meta.pkl", pickle.dumps(payload))

                with open(bundle_path, "wb") as f:
                    f.write(mem.getvalue())

            return True, f"Saved bundle: {bundle_path}"
        except Exception as e:
            logger.exception("Failed to save bundle")
            return False, str(e)

    def load_bundle(self, bundle_path: str, expected_kind: List[str]) -> Tuple[bool, str]:
        try:
            with open(bundle_path, "rb") as f:
                data = f.read()

            if data[:2] == b"PK": # ZIP format
                with zipfile.ZipFile(io.BytesIO(data), "r") as z:
                    meta = pickle.loads(z.read("meta.pkl"))
                    if meta.get("kind") not in expected_kind:
                        return False, f"Unexpected bundle kind: {meta.get('kind')}"

                    ok, msg = self._check_compat(meta)
                    if not ok:
                        return False, msg

                    with tempfile.TemporaryDirectory() as tmp:
                        model_file = os.path.join(tmp, "model.keras")
                        # Try both names for backward compatibility with the very recent broken version
                        internal_name = "model.keras" if "model.keras" in z.namelist() else "model_data"
                        with open(model_file, "wb") as mf:
                            mf.write(z.read(internal_name))
                        self._load_model_from_path(model_file)

                    # Load single statistical threshold from bundle
                    th_tuple = meta.get("thresholds", (0.0,))
                    self.threshold = float(th_tuple[0]) if th_tuple else 0.0
                    
                    # 1. Capture current runtime manual threshold (if any)
                    runtime_m_th = float(self.cfg.get("MANUAL_THRESHOLD", 0.0))
                    
                    # 2. Capture bundle's manual threshold
                    bundle_m_th = float(meta.get("cfg", {}).get("MANUAL_THRESHOLD", 0.0))
                    
                    # 3. Decision: Runtime override (from UI) takes absolute priority
                    # If runtime is 0, we take bundle. If both 0, stays 0.
                    if runtime_m_th > 0:
                        self.cfg["MANUAL_THRESHOLD"] = runtime_m_th
                    elif bundle_m_th > 0:
                        self.cfg["MANUAL_THRESHOLD"] = bundle_m_th

                    self.global_psd_mean = meta.get("global_psd_mean")
                    self.global_psd_std = meta.get("global_psd_std")
                    self.model_loaded = True
                    self.init_message = f"📂 Loaded bundle: {os.path.basename(bundle_path)}"
                    return True, self.init_message
            else:
                return False, "Not a valid bundle (ZIP expected)"
        except Exception as e:
            logger.exception("Failed to load bundle")
            return False, str(e)

    def _check_compat(self, meta: Dict[str, Any]) -> Tuple[bool, str]:
        m_sr = int(meta.get("sr", -1))
        m_bins = int(meta.get("n_bins", -1))
        m_log = bool(meta.get("use_log", False))

        c_sr = int(self.cfg.get("SR", -1))
        c_bins = int(self.cfg.get("N_FREQ_BINS", -1))
        c_log = bool(self.cfg.get("USE_LOG", False))

        bad = []
        if m_sr != c_sr: bad.append(f"SR ({m_sr} != {c_sr})")
        if m_bins != c_bins: bad.append(f"Bins ({m_bins} != {c_bins})")
        if m_log != c_log: bad.append(f"Log ({m_log} != {c_log})")

        if bad:
            return False, "Compatibility error: " + ", ".join(bad)
        return True, "OK"

    @abstractmethod
    def _save_model_to_path(self, path: str):
        pass

    @abstractmethod
    def _load_model_from_path(self, path: str):
        pass

    def train_from_folder(self, folder: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        try:
            wavs = [f for f in os.listdir(folder) if f.lower().endswith(".wav")]
            if not wavs: return False, "No WAV files found", None

            raw_feats = []
            for f in wavs:
                p = os.path.join(folder, f)
                feat, _ = features.extract_psd(p, self.cfg["SR"], self.cfg["N_PERSEG"], self.cfg["N_FFT"], 
                                             self.cfg["N_FREQ_BINS"], use_log=self.cfg["USE_LOG"])
                if feat is not None: raw_feats.append(feat)

            if not raw_feats: return False, "Failed to extract features", None

            raw_feats = np.array(raw_feats, dtype=np.float64)
            self.global_psd_mean = np.mean(raw_feats, axis=0)
            self.global_psd_std = np.std(raw_feats, axis=0) + 1e-12

            feats = (raw_feats - self.global_psd_mean) / self.global_psd_std
            feats = np.nan_to_num(feats, nan=0.0).astype(np.float32)

            self._build_model(self.cfg["N_FREQ_BINS"])
            self._train_internal(feats)

            # Threshold initialization (using 4 sigma as a robust default)
            errors = []
            for x in feats:
                pred = self._predict_internal(x.reshape(1, -1))[0]
                errors.append(float(np.mean((x - pred) ** 2)))
            
            m, s = float(np.mean(errors)), float(np.std(errors))


            self.model_loaded = True
            model_name = self.__class__.__name__.replace("Model", "").upper()
            self.init_message = f"✅ {model_name} initialized"

            metrics = {
                "mean_mse": m,
                "std_mse": s,
                "num_samples": len(feats),
            }
            return True, self.init_message, metrics

        except Exception as e:
            logger.exception("Training failed")
            return False, str(e), None

    def detect(self, wav_path: str) -> Tuple[str, float, Optional[Tuple]]:
        if not self.model_loaded or self.model is None:
            return "❌ Model not loaded", 0.0, None

        x, _ = features.extract_psd(wav_path, self.cfg["SR"], self.cfg["N_PERSEG"], self.cfg["N_FFT"], 
                                  self.cfg["N_FREQ_BINS"], use_log=self.cfg["USE_LOG"],
                                  global_mean=self.global_psd_mean, global_std=self.global_psd_std)
        if x is None: return "❌ PSD error", 0.0, None

        psd_real, freqs = features.extract_psd(wav_path, self.cfg["SR"], self.cfg["N_PERSEG"], self.cfg["N_FFT"], 
                                             self.cfg["N_FREQ_BINS"], for_plot=True)
        if psd_real is None: return "❌ Plot error", 0.0, None

        psd_real = psd_real / (np.sum(psd_real) + 1e-12)
        x_san = np.nan_to_num(x, nan=0.0).astype(np.float32)

        pred = self._predict_internal(x_san.reshape(1, -1))[0]
        mse = float(np.mean((x_san - pred) ** 2))
        
        if np.isnan(mse) or np.isinf(mse): mse = 999.0

        psd_recon = features.invert_model_psd(pred, self.cfg["USE_LOG"], self.global_psd_mean, self.global_psd_std)
        psd_pair = (freqs, psd_real, psd_recon)

        # Check for manual threshold override in config
        effective_threshold = self.cfg.get("MANUAL_THRESHOLD", 0.0)
        if effective_threshold <= 0:
             effective_threshold = self.threshold

        if mse < effective_threshold:
            status = "✅ Normal"
        else:
            status = "🔴 Abnormal"

        return status, mse, psd_pair
