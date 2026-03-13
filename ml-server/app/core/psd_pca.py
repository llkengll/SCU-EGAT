import os
import re
import pickle
import numpy as np
from datetime import datetime
from typing import Optional, Tuple, Dict, Any, List

from app.core.base_model import AbstractPSDModel
from app.core import features

# ===================== CONFIG =====================
CFG = {
    "SR": 48000,
    "N_FREQ_BINS": 1024,
    "N_PERSEG": 2048,
    "N_FFT" : 2048,
    "USE_LOG": True,
    "MANUAL_THRESHOLD": 0.0,
    "PCA_N_COMPONENTS": 32,
    "PCA_MIN_SAMPLES": 10
}

class PCAModel(AbstractPSDModel):
    def __init__(self):
        super().__init__(CFG)
        self.pca_mu = None
        self.pca_components = None

    def _build_model(self, input_dim: int):
        # PCA doesn't need a build step like Keras
        pass

    def _train_internal(self, feats: np.ndarray):
        k = self.cfg.get("PCA_N_COMPONENTS", 16)
        self.pca_mu = np.mean(feats, axis=0)
        xc = feats - self.pca_mu
        _, _, Vt = np.linalg.svd(xc, full_matrices=False)
        k_eff = int(min(k, Vt.shape[0]))
        self.pca_components = Vt[:k_eff, :]
        self.model = True # Dummy for base class check

    def _predict_internal(self, x: np.ndarray) -> np.ndarray:
        # x: (n, d)
        xc = x - self.pca_mu
        z = xc @ self.pca_components.T # (n, k)
        x_hat = self.pca_mu + z @ self.pca_components
        return x_hat

    def _save_model_to_path(self, path: str):
        with open(path, "wb") as f:
            pickle.dump({
                "pca_mu": self.pca_mu,
                "pca_components": self.pca_components
            }, f)

    def _load_model_from_path(self, path: str):
        with open(path, "rb") as f:
            data = pickle.load(f)
            self.pca_mu = data["pca_mu"]
            self.pca_components = data["pca_components"]
        self.model = True

    def train_from_folder(self, folder: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        # Override to check min samples
        wavs = [f for f in os.listdir(folder) if f.lower().endswith(".wav")]
        if len(wavs) < self.cfg.get("PCA_MIN_SAMPLES", 10):
            return False, f"Not enough samples for PCA ({len(wavs)} < {self.cfg['PCA_MIN_SAMPLES']})", None
        return super().train_from_folder(folder)

# ===================== GLOBAL INSTANCE & MODULE API =====================
_inst = PCAModel()
model_loaded = False 

def _sync():
    global model_loaded
    model_loaded = _inst.model_loaded

def get_config_schema():
    return {
        "SR": {"type":"int", "min":8000, "max":96000, "requires_retrain": True},
        "N_FREQ_BINS": {"type":"int", "choices":[256,512,1024,2048,4096], "requires_retrain": True},
        "N_PERSEG": {"type":"int", "choices":[256,512,1024,2048,4096], "requires_retrain": True},
        "N_FFT": {"type":"int", "choices":[256,512,1024,2048,4096], "requires_retrain": True},
        "MANUAL_THRESHOLD": {"type":"float", "min":0.0, "max":100.0, "requires_retrain": False},
        "PCA_N_COMPONENTS": {"type":"int", "min":1, "max":128, "requires_retrain": True},
        "PCA_MIN_SAMPLES": {"type":"int", "min":1, "max":1000, "requires_retrain": True},
    }

def save_model_bundle(path: str):
    return _inst.save_bundle(path, "PCA_PSD_BUNDLE_V1")

def load_model_from_file(path: str):
    res = _inst.load_bundle(path, ["PCA_PSD_BUNDLE_V1"])
    _sync()
    return res

def initialize_model_from_folder(folder: str):
    res = _inst.train_from_folder(folder)
    _sync()
    return res

def detect_and_update(wav_path: str):
    return _inst.detect(wav_path)

def get_current_threshold():
    return _inst.get_active_threshold()

def get_init_message():
    return _inst.init_message

def get_config():
    return _inst.get_config()

def set_config(cfg: dict):
    res = _inst.set_config(cfg)
    _sync()
    return res

def extract_index(fname: str) -> int:
    m = re.search(r"\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}", fname)
    if not m: return datetime.max 
    return datetime.strptime(m.group(0), "%Y-%m-%dT%H-%M-%S")

def run_test_folder(folder: str):
    results = []
    files = sorted([(extract_index(f), f) for f in os.listdir(folder) if f.lower().endswith(".wav")], key=lambda x: x[0])
    for _, f in files:
        status, mse, _ = _inst.detect(os.path.join(folder, f))
        results.append((f, mse, status))
    return results, float(_inst.threshold)
