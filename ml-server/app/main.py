import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import jwt
from functools import wraps
from app.core import psd_ae, psd_pca, psd_vae
from app.services import minio_service, db_service

load_dotenv()

app = Flask(__name__)
CORS(app)

MODELS = {
    "ae": psd_ae,
    "pca": psd_pca,
    "vae": psd_vae
}

JWT_SECRET = os.getenv('JWT_SECRET', 'scu_secret_key_2026')

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'No token, authorization denied'}), 401
            
        token = auth_header.split(' ')[1]
        try:
            # We skip audience verification since simple token usage
            decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            request.user = decoded
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token is not valid'}), 401
            
        return f(*args, **kwargs)
    return decorated

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "ml-server",
        "version": "1.0.0"
    }), 200

@app.route('/v1/predict', methods=['POST'])
@require_auth
def predict():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Check if we should download from MinIO or use local path
    bucket = data.get('bucket', os.getenv('MINIO_BUCKET_NAME', 'scu-data'))
    filename = data.get('filename')
    wav_path = data.get('wav_path')
    kks = data.get('kks')
    point = data.get('measurement_point', 0)
    mtype = data.get('measurement_type', 'vibration')

    if bucket and filename:
        wav_path = minio_service.download_audio(bucket, filename)
        if not wav_path:
            return jsonify({"error": "Failed to download file from MinIO"}), 500
    elif not wav_path:
        return jsonify({"error": "No wav_path or MinIO bucket/filename provided"}), 400
    
    if not os.path.exists(wav_path):
        return jsonify({"error": f"File not found: {wav_path}"}), 404

    model_type = data.get('model_type', 'ae').lower()
    if model_type not in MODELS:
        return jsonify({"error": f"Invalid model_type: {model_type}. Must be one of {list(MODELS.keys())}"}), 400

    try:
        if kks and point and mtype:
            # 1. Get the path of the active model for this specific sensor point from DB
            active_model_path = db_service.get_active_model_path(kks, point, mtype, model_type)
            if not active_model_path:
                return jsonify({"error": f"No active model found for KKS={kks}, P={point}, Type={mtype}"}), 404
            
            # 2. Download the model bundle using MinIO service
            local_bundle = minio_service.download_audio(bucket, active_model_path)
            if not local_bundle or not os.path.exists(local_bundle):
                return jsonify({"error": f"Failed to download active model bundle from {active_model_path}"}), 500
            
            # 3. Load the model into the ML engine dynamically
            success, message = MODELS[model_type].load_model_from_file(local_bundle)
            if not success or (hasattr(MODELS[model_type], "model_loaded") and not MODELS[model_type].model_loaded):
                # Clean up if load fails
                if os.path.exists(local_bundle):
                    os.remove(local_bundle)
                return jsonify({"error": f"Failed to load active model: {message}"}), 500

            # 4. Cleanup downloaded `.bundle`
            if os.path.exists(local_bundle):
                os.remove(local_bundle)
        
        # 5. Execute Inference
        status, mse, psd_pair = MODELS[model_type].detect_and_update(wav_path)
        
        # Save results to Database as per implementation plan
        db_service.save_inference_result(wav_path, model_type, mse, status)
        
        return jsonify({
            "status": "success",
            "detection": status,
            "mse": mse,
            "wav_path": wav_path,
            "model_type": model_type
        }), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/v1/predict_bulk', methods=['POST'])
@require_auth
def predict_bulk():
    """Predicts multiple MinIO files using multiple specified models."""
    data = request.get_json()
    bucket = data.get('bucket', os.getenv('MINIO_BUCKET_NAME', 'scu-data'))
    filenames = data.get('filenames', [])
    models_to_run = data.get('models', []) # List of {type, path}
    
    if not filenames:
        return jsonify({"error": "No filenames provided"}), 400
    if not models_to_run:
        return jsonify({"error": "No models provided"}), 400

    import numpy as np
    all_results = []
    
    try:
        # We'll process file by file to minimize concurrent memory usage
        # and we'll cache models during this single request block
        loaded_models = {}

        for filename in filenames:
            wav_path = minio_service.download_audio(bucket, filename)
            if not wav_path:
                all_results.append({"filename": filename, "error": "Download failed"})
                continue
            
            file_results = {"filename": filename, "predictions": {}}
            
            try:
                for m_info in models_to_run:
                    m_type = m_info.get('type', 'ae').lower()
                    m_path = m_info.get('path')
                    
                    if not m_path or m_type not in MODELS:
                        continue
                    
                    # Load model only if not already loaded in this request
                    # Note: This is an in-memory session load, it might disrupt 
                    # other requests if using a shared global MODELS instance.
                    # But since this server is usually single-worker/single-purpose
                    # or models are small, we load it here.
                    cache_key = f"{m_type}_{m_path}"
                    if cache_key not in loaded_models:
                        local_bundle = minio_service.download_audio(bucket, m_path)
                        if local_bundle:
                            MODELS[m_type].load_model_from_file(local_bundle)
                            if os.path.exists(local_bundle): os.remove(local_bundle)
                            loaded_models[cache_key] = True
                    
                    # Manual threshold override if provided
                    manual_threshold = m_info.get('manual_threshold')
                    if manual_threshold is not None:
                         MODELS[m_type].set_config({"MANUAL_THRESHOLD": float(manual_threshold)})

                    status, mse, psd_pair = MODELS[m_type].detect_and_update(wav_path)
                    
                    psd_serializable = None
                    if psd_pair:
                        psd_serializable = [arr.tolist() if isinstance(arr, np.ndarray) else arr for arr in psd_pair]

                    file_results["predictions"][m_type] = {
                        "detection": status,
                        "mse": float(mse),
                        "threshold": float(MODELS[m_type].get_current_threshold()),
                        "psd_pair": psd_serializable
                    }
                
                all_results.append(file_results)
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                all_results.append({"filename": filename, "error": str(e)})
            finally:
                if os.path.exists(wav_path): os.remove(wav_path)

        return jsonify({
            "status": "success",
            "results": all_results
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
@app.route('/v1/predict_test_all', methods=['POST'])
@require_auth
def predict_test_all():
    """Predicts a single uploaded wav file using multiple models provided in the 'models' form field."""
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    file = request.files['audio']
    models_data_str = request.form.get('models')
    if not models_data_str:
        return jsonify({"error": "No models information provided"}), 400
    
    import json
    try:
        models_list = json.loads(models_data_str)
    except:
        return jsonify({"error": "Invalid models format"}), 400

    import tempfile
    wav_path = None
    results = {}
    
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_wav:
            file.save(tmp_wav.name)
            wav_path = tmp_wav.name
            
        bucket = os.getenv('MINIO_BUCKET_NAME', 'scu-data')
        import numpy as np

        for m_info in models_list:
            m_path = m_info.get('path')
            m_type = m_info.get('type', 'ae').lower()
            
            if not m_path or m_type not in MODELS:
                continue

            # Download and load
            local_bundle = minio_service.download_audio(bucket, m_path)
            if not local_bundle:
                results[m_type] = {"error": "Failed to download bundle"}
                continue
                
            load_ok, _ = MODELS[m_type].load_model_from_file(local_bundle)
            if not load_ok:
                results[m_type] = {"error": "Failed to load model"}
                if os.path.exists(local_bundle): os.remove(local_bundle)
                continue
                
            manual_threshold = m_info.get('manual_threshold')
            if manual_threshold is not None:
                try:
                    MODELS[m_type].set_config({"MANUAL_THRESHOLD": float(manual_threshold)})
                except (ValueError, TypeError):
                    pass
                
            status, mse, psd_pair = MODELS[m_type].detect_and_update(wav_path)
            
            # Serialize psd_pair
            psd_pair_serializable = None
            if psd_pair is not None:
                if isinstance(psd_pair, (list, tuple)):
                    psd_pair_serializable = [arr.tolist() if isinstance(arr, np.ndarray) else arr for arr in psd_pair]
                else:
                    psd_pair_serializable = psd_pair.tolist() if isinstance(psd_pair, np.ndarray) else psd_pair

            results[m_type] = {
                "detection": status,
                "mse": mse,
                "threshold": MODELS[m_type].get_current_threshold(),
                "psd_pair": psd_pair_serializable
            }
            
            if os.path.exists(local_bundle):
                os.remove(local_bundle)
                
        return jsonify({
            "status": "success",
            "results": results
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if wav_path and os.listdir(os.path.dirname(wav_path)) and os.path.exists(wav_path):
            os.remove(wav_path)

@app.route('/v1/psd_preview', methods=['POST'])
@require_auth
def psd_preview():
    """Extracts PSD from a file in MinIO for visualization without inference."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    bucket = data.get('bucket', os.getenv('MINIO_BUCKET_NAME', 'scu-data'))
    filename = data.get('filename')
    
    if not bucket or not filename:
        return jsonify({"error": "bucket and filename are required"}), 400
        
    wav_path = minio_service.download_audio(bucket, filename)
    if not wav_path:
        return jsonify({"error": "Failed to download audio from MinIO"}), 500
        
    try:
        from app.core import features
        import numpy as np
        
        # Standard spectral settings matching the default AE config
        SR = 48000
        N_FREQ_BINS = 1024
        N_PERSEG = 2048
        N_FFT = 2048
        
        # Extract PSD specifically for plotting
        psd_real, freqs = features.extract_psd(wav_path, SR, N_PERSEG, N_FFT, N_FREQ_BINS, for_plot=True)
        
        if psd_real is None:
            return jsonify({"error": "Spectral extraction failed"}), 500
            
        # Normalize for visualization consistency
        psd_real = psd_real / (np.sum(psd_real) + 1e-12)
        
        return jsonify({
            "status": "success",
            "psd_pair": [freqs.tolist(), psd_real.tolist(), []] # Third element empty as no reconstruction for preview
        }), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if wav_path and os.path.exists(wav_path):
            os.remove(wav_path)

@app.route('/v1/check_model', methods=['POST'])
@require_auth
def check_model():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    kks = data.get('kks')
    point = data.get('point', 0)
    measurement_type = data.get('measurement_type', 'vibration')
    
    model_name = data.get('model_name', 'default')
    
    if not kks:
        return jsonify({"error": "kks is required"}), 400
        
    # If next_version > 1, it means at least one version already exists in DB
    next_ver = db_service.get_next_version(kks, int(point), measurement_type, "ae", model_name)
    return jsonify({"exists": next_ver > 1}), 200

@app.route('/v1/next_version', methods=['POST'])
@require_auth
def next_version():
    """Returns the next version number for a model (kks + point + measurement_type)."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    kks = data.get('kks')
    point = data.get('point', 0)
    measurement_type = data.get('measurement_type', 'vibration')
    
    model_name = data.get('model_name', 'default')
    
    if not kks:
        return jsonify({"error": "kks is required"}), 400
    
    version = db_service.get_next_version(kks, int(point), measurement_type, "ae", model_name)
    return jsonify({"version": version}), 200

@app.route('/v1/train_all', methods=['POST'])
@require_auth
def train_all():
    """Trains all 3 models (AE, PCA, VAE) sequentially with streaming logs."""
    from flask import Response
    import time
    import shutil
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    bucket = data.get('bucket')
    prefix = data.get('prefix')
    model_name = data.get('model_name', 'default')
    model_configs = data.get('model_configs', {}) # User-defined configurations from frontend
    
    if not bucket or not prefix:
        return jsonify({"error": "bucket and prefix are required"}), 400

    def generate():
        import tempfile
        import datetime
        
        def format_log(level, msg, icon=""):
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            icon_str = f"{icon} " if icon else ""
            return f"[{timestamp}] [{level}] {icon_str}{msg}\n"

        folder_path = None
        try:
            yield format_log("SYSTEM", "Initializing Neural Network Training Pipeline...", "🚀")
            yield format_log("SYSTEM", f"MinIO Source: {bucket}/{prefix}", "📂")
            yield format_log("SYSTEM", f"Model Identity: {model_name}", "🆔")
            
            # Step 1: Download training data
            yield format_log("PROCESS", "Step 1/4: Synchronizing dataset from Cloud Storage...", "⏳")
            folder_path = minio_service.download_folder(bucket, prefix)
            if not folder_path:
                yield format_log("ERROR", "Data synchronization failed. Check MinIO connectivity.", "❌")
                return
            
            num_files = len([f for f in os.listdir(folder_path) if f.lower().endswith('.wav')])
            yield format_log("SUCCESS", f"Dataset ready: {num_files} high-fidelity samples synchronized.", "✅")
            
            # Step 2: Derive model prefix
            path_parts = prefix.strip('/').split('/')
            kks = path_parts[0] if len(path_parts) > 0 else 'Unknown'
            point_str = path_parts[1] if len(path_parts) > 1 else '0'
            point = int(point_str.replace('P', '')) if point_str.replace('P', '').isdigit() else 0
            mtype = path_parts[2] if len(path_parts) > 2 else 'vibration'
            
            p_folder = point_str if point_str.startswith('P') else f"P{point_str}"
            model_prefix = f"{kks}/{p_folder}/{mtype}/models/{model_name}/"

            next_version = 1
            for part in path_parts:
                if part.startswith('v') and part[1:].isdigit():
                    next_version = int(part[1:])
                    break
            yield format_log("SYSTEM", f"Target Version: v{next_version} (Release Candidate)", "📦")

            # Train each model
            for i, model_type in enumerate(["ae", "pca", "vae"], 2):
                m_upper = model_type.upper()
                yield format_log("PROCESS", f"Step {i}/4: Training {m_upper} Engine...", "🧠")
                
                # Apply custom config if provided
                if model_configs and m_upper in model_configs:
                    try:
                        yield format_log(m_upper, "Injecting custom hyper-parameters...", "💉")
                        MODELS[model_type].set_config(model_configs[m_upper])
                        yield format_log(m_upper, "Hyper-parameters optimization applied.", "✨")
                    except Exception as cfg_ex:
                        yield format_log("WARNING", f"{m_upper} configuration mismatch: {str(cfg_ex)}", "⚠️")

                start_time = time.time()
                
                try:
                    success, message, training_metrics = MODELS[model_type].initialize_model_from_folder(folder_path)
                    elapsed = time.time() - start_time
                    if success:
                        yield format_log(m_upper, f"Training converged. Metrics: {message} ({elapsed:.2f}s)", "📊")
                        
                        parameters = MODELS[model_type].get_config()
                        local_model_path = os.path.join(tempfile.gettempdir(), f"{model_type}_model.bundle")
                        s_ok, s_msg = MODELS[model_type].save_model_bundle(local_model_path)
                        
                        if s_ok:
                            model_obj_name = f"{model_prefix}v{next_version}/{model_type}_model.bundle"
                            yield format_log(m_upper, f"Archiving model to Cloud: {model_obj_name}", "☁️")
                            if minio_service.upload_file(bucket, model_obj_name, local_model_path):
                                yield format_log(m_upper, "Cloud storage persistent. ✅", "💾")
                                
                                # Step 3: Save to Database
                                result = db_service.save_model_info(
                                    kks, point, mtype, model_name, model_type, model_obj_name,
                                    training_metrics=training_metrics,
                                    parameters=parameters
                                )
                                if result:
                                    yield format_log(m_upper, f"Metadata registered in database (v{next_version}). ✅", "📝")
                                else:
                                    yield format_log("WARNING", f"{m_upper} database registration deferred.", "⚠️")
                            else:
                                yield format_log("ERROR", f"{m_upper} cloud upload failed. Check instance permissions.", "🚫")
                        else:
                            yield format_log("ERROR", f"{m_upper} serialization failure: {s_msg}", "🧨")
                        
                        if os.path.exists(local_model_path):
                            os.remove(local_model_path)
                    else:
                        yield format_log("ERROR", f"{m_upper} engine error: {message}", "❌")
                except Exception as ex:
                    import traceback
                    traceback.print_exc()
                    yield format_log("EXCEPTION", f"{m_upper} runtime error: {str(ex)}", "💥")
            
            yield format_log("SYSTEM", "Inference engines ready. Deployment successful! 🚀", "🏁")
            
        except Exception as e:
            yield format_log("ERROR", f"Critical pipeline failure: {str(e)}", "💀")
        finally:
            if folder_path and os.path.exists(folder_path):
                shutil.rmtree(folder_path)

    return Response(generate(), mimetype='text/plain')

if __name__ == '__main__':
    # Initialize ML methods in DB
    db_service.initialize_ml_methods()
    
    # Run the Flask app
    app.run(host='0.0.0.0', port=int(os.getenv('ML_SERVER_PORT', 5000)), debug=True)
