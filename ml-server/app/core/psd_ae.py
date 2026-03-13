import os
import re
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import Model as KModel
from tensorflow.keras.layers import Input, Dense, BatchNormalization, Dropout, LeakyReLU
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

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
    "AE_LATENT_DIM": 4,
    "EPOCHS": 500,
    "BATCH_SIZE": 8,
}

class AEModel(AbstractPSDModel):
    def __init__(self):
        super().__init__(CFG)

    def _build_model(self, input_dim: int):
        latent_dim = self.cfg.get("AE_LATENT_DIM", 4)
        inp = Input(shape=(input_dim,), name="x")
        
        # Encoder
        x = Dense(256)(inp)
        x = BatchNormalization()(x)
        x = LeakyReLU(alpha=0.1)(x)
        x = Dropout(0.2)(x)
        
        x = Dense(128)(x)
        x = BatchNormalization()(x)
        x = LeakyReLU(alpha=0.1)(x)
        x = Dropout(0.2)(x)
        
        z = Dense(latent_dim, activation="linear", name="z")(x)
        
        # Decoder
        y = Dense(128)(z)
        y = BatchNormalization()(y)
        y = LeakyReLU(alpha=0.1)(y)
        y = Dropout(0.2)(y)
        
        y = Dense(256)(y)
        y = BatchNormalization()(y)
        y = LeakyReLU(alpha=0.1)(y)
        y = Dropout(0.2)(y)
        
        out = Dense(input_dim, activation="linear", name="x_hat")(y)
        
        self.model = KModel(inp, out, name="ae")
        self.model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3), loss="mse")

    def _train_internal(self, feats: np.ndarray):
        early_stop = EarlyStopping(
            monitor="loss", 
            patience=20, 
            restore_best_weights=True,
            verbose=1
        )
        reduce_lr = ReduceLROnPlateau(
            monitor="loss", 
            factor=0.5, 
            patience=10, 
            min_lr=1e-6,
            verbose=1
        )
        
        self.model.fit(
            feats, feats, 
            epochs=self.cfg["EPOCHS"], 
            batch_size=self.cfg["BATCH_SIZE"], 
            callbacks=[early_stop, reduce_lr],
            verbose=0
        )

    def _predict_internal(self, x: np.ndarray) -> np.ndarray:
        return self.model.predict(x, verbose=0)

    def _save_model_to_path(self, path: str):
        self.model.save(path)

    def _load_model_from_path(self, path: str):
        self.model = tf.keras.models.load_model(path)

# ===================== GLOBAL INSTANCE =====================
_inst = AEModel()
model_loaded = False 

def _sync():
    global model_loaded
    model_loaded = _inst.model_loaded

# ===================== MODULE API (Backward Compatible) =====================

def get_config_schema():
    return {
        "SR": {"type":"int", "min":8000, "max":96000, "requires_retrain": True},
        "N_FREQ_BINS": {"type":"int", "choices":[256,512,1024,2048,4096], "requires_retrain": True},
        "N_PERSEG": {"type":"int", "choices":[256,512,1024,2048,4096], "requires_retrain": True},
        "N_FFT": {"type":"int", "choices":[256,512,1024,2048,4096], "requires_retrain": True},
        "MANUAL_THRESHOLD": {"type":"float", "min":0.0, "max":100.0, "requires_retrain": False},
        "AE_LATENT_DIM": {"type":"int", "min":2, "max":64, "requires_retrain": True},
        "EPOCHS": {"type":"int", "min":10, "max":2000, "requires_retrain": True},
        "BATCH_SIZE": {"type":"int", "min":1, "max":256, "requires_retrain": True},
    }

def save_model_bundle(path: str):
    return _inst.save_bundle(path, "AE_PSD_BUNDLE_V1")

def load_model_from_file(path: str):
    # Support both AE and VAE kind for legacy
    res = _inst.load_bundle(path, ["AE_PSD_BUNDLE_V1", "VAE_PSD_BUNDLE_V1"])
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

# Utils needed by main.py or training
def extract_index(fname: str) -> int:
    m = re.search(r"\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}", fname)
    if not m: return datetime.max 
    return datetime.strptime(m.group(0), "%Y-%m-%dT%H-%M-%S")

def run_test_folder(folder: str):
    results = []
    files = []
    for f in os.listdir(folder):
        if f.lower().endswith(".wav"):
            files.append((extract_index(f), f))
    files.sort(key=lambda x: x[0])
    for _, f in files:
        path = os.path.join(folder, f)
        res, mse, _ = _inst.detect(path)
        results.append((f, mse, res))
    return results, float(_inst.threshold)

# Proxy for model_loaded
import sys
class ModuleProxy(object):
    def __init__(self, module):
        self.__dict__['module'] = module
    def __getattr__(self, name):
        if name == 'model_loaded':
            return _inst.model_loaded
        return getattr(self.module, name)
    def __setattr__(self, name, value):
        if name == 'model_loaded':
             _inst.model_loaded = value
        else:
            setattr(self.module, name, value)

# sys.modules[__name__] = ModuleProxy(sys.modules[__name__]) 
# The above proxy might be too complex for simple use. 
# Let's just use a property-like behavior if possible, 
# or just update the variable manually in the class if needed.
# Actually, the ML server checks MODELS[model_type].model_loaded.
# I'll just make sure _inst.model_loaded is accessible.

def is_model_loaded():
    return _inst.model_loaded
