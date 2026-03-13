import os
import re
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
from tensorflow.keras.models import Model as KModel
from tensorflow.keras.layers import Input, Dense, BatchNormalization, Dropout, LeakyReLU
from tensorflow.keras.utils import serialize_keras_object, deserialize_keras_object
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from datetime import datetime
from typing import Optional, Tuple, Dict, Any

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
    "VAE_LATENT_DIM": 8,
    "EPOCHS": 500,
    "BATCH_SIZE": 8,
}

# ===================== VAE LAYERS =====================
@tf.keras.utils.register_keras_serializable(package="PSD")
class Sampling(layers.Layer):
    def call(self, inputs):
        z_mean, z_logvar = inputs
        eps = tf.random.normal(shape=tf.shape(z_mean))
        return z_mean + tf.exp(0.5 * z_logvar) * eps

@tf.keras.utils.register_keras_serializable(package="PSD")
class VAE(KModel):
    def __init__(self, encoder=None, decoder=None, beta=0.1, **kwargs):
        super().__init__(**kwargs)
        self.encoder = encoder
        self.decoder = decoder
        self.beta = float(beta)
        self.total_loss_tracker = tf.keras.metrics.Mean(name="loss")
        self.recon_loss_tracker = tf.keras.metrics.Mean(name="recon_loss")
        self.kl_loss_tracker = tf.keras.metrics.Mean(name="kl_loss")

    @property
    def metrics(self):
        return [self.total_loss_tracker, self.recon_loss_tracker, self.kl_loss_tracker]

    def train_step(self, data):
        x = data[0] if isinstance(data, (tuple, list)) else data
        with tf.GradientTape() as tape:
            z_mean, z_logvar, z = self.encoder(x, training=True)
            x_hat = self.decoder(z, training=True)
            recon = tf.reduce_mean(tf.reduce_sum(tf.square(x - x_hat), axis=1))
            kl = -0.5 * tf.reduce_mean(tf.reduce_sum(1 + z_logvar - tf.square(z_mean) - tf.exp(z_logvar), axis=1))
            loss = recon + self.beta * kl
        grads = tape.gradient(loss, self.trainable_weights)
        self.optimizer.apply_gradients(zip(grads, self.trainable_weights))
        self.total_loss_tracker.update_state(loss)
        self.recon_loss_tracker.update_state(recon)
        self.kl_loss_tracker.update_state(kl)
        return {"loss": self.total_loss_tracker.result(), "recon_loss": self.recon_loss_tracker.result(), "kl_loss": self.kl_loss_tracker.result()}

    def call(self, x, training=False):
        res = self.encoder(x, training=training)
        z = res[2] if isinstance(res, (tuple, list)) else res
        return self.decoder(z, training=training)

    def get_config(self):
        config = super().get_config()
        config.update({"beta": self.beta, "encoder": serialize_keras_object(self.encoder), "decoder": serialize_keras_object(self.decoder)})
        return config

    @classmethod
    def from_config(cls, config):
        enc_cfg = config.pop("encoder")
        dec_cfg = config.pop("decoder")
        return cls(encoder=deserialize_keras_object(enc_cfg), decoder=deserialize_keras_object(dec_cfg), **config)

class VAEModel(AbstractPSDModel):
    def __init__(self):
        super().__init__(CFG)

    def _build_model(self, input_dim: int):
        latent_dim = self.cfg.get("VAE_LATENT_DIM", 8)
        
        # Encoder
        enc_in = Input(shape=(input_dim,), name="x")
        x = Dense(256)(enc_in)
        x = BatchNormalization()(x)
        x = LeakyReLU(alpha=0.1)(x)
        x = Dropout(0.2)(x)
        
        x = Dense(128)(x)
        x = BatchNormalization()(x)
        x = LeakyReLU(alpha=0.1)(x)
        x = Dropout(0.2)(x)
        
        z_mean = Dense(latent_dim, name="z_mean")(x)
        z_logvar = Dense(latent_dim, name="z_logvar")(x)
        z = Sampling(name="z")([z_mean, z_logvar])
        encoder = KModel(enc_in, [z_mean, z_logvar, z], name="encoder")
        
        # Decoder
        dec_in = Input(shape=(latent_dim,), name="z_in")
        y = Dense(128)(dec_in)
        y = BatchNormalization()(y)
        y = LeakyReLU(alpha=0.1)(y)
        y = Dropout(0.2)(y)
        
        y = Dense(256)(y)
        y = BatchNormalization()(y)
        y = LeakyReLU(alpha=0.1)(y)
        y = Dropout(0.2)(y)
        
        out = Dense(input_dim, activation="linear")(y)
        decoder = KModel(dec_in, out, name="decoder")
        
        self.model = VAE(encoder=encoder, decoder=decoder, beta=0.1, name="vae")
        self.model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3))

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
            feats, 
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
        self.model = tf.keras.models.load_model(path, custom_objects={"VAE": VAE, "Sampling": Sampling})

# ===================== GLOBAL INSTANCE & MODULE API =====================
_inst = VAEModel()
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
        "VAE_LATENT_DIM": {"type":"int", "min":2, "max":64, "requires_retrain": True},
        "EPOCHS": {"type":"int", "min":10, "max":2000, "requires_retrain": True},
        "BATCH_SIZE": {"type":"int", "min":1, "max":256, "requires_retrain": True},
    }

def save_model_bundle(path: str):
    return _inst.save_bundle(path, "VAE_PSD_BUNDLE_V1")

def load_model_from_file(path: str):
    res = _inst.load_bundle(path, ["VAE_PSD_BUNDLE_V1", "AE_PSD_BUNDLE_V1"])
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
