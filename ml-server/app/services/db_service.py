import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            port=os.getenv('DB_PORT', '5432'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', 'password'),
            database=os.getenv('POSTGRES_DB', 'scu_db')
        )
        return conn
    except Exception as e:
        print(f"Error connecting to DB: {e}")
        return None

def initialize_ml_methods():
    """Ensures basic ML methods exist in the database."""
    conn = get_db_connection()
    if not conn:
        return
    try:
        cur = conn.cursor()
        methods = [
            ('AE', 'Autoencoder for anomaly detection'),
            ('PCA', 'Principal Component Analysis for anomaly detection'),
            ('VAE', 'Variational Autoencoder for anomaly detection')
        ]
        for name, desc in methods:
            cur.execute("INSERT INTO ml_methods (name, description) VALUES (%s, %s) ON CONFLICT (name) DO NOTHING", (name, desc))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error initializing ML methods: {e}")

def get_next_version(kks, point, measurement_type, model_type, model_name='default'):
    """Gets the next version number for a model (does not insert anything)."""
    conn = get_db_connection()
    if not conn:
        return 1
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM ml_methods WHERE name = %s", (model_type.upper(),))
        row = cur.fetchone()
        method_id = row[0] if row else None
        if not method_id:
            cur.close()
            conn.close()
            return 1
        cur.execute("""
            SELECT COALESCE(MAX(version), 0) FROM ml_models 
            WHERE kks = %s AND measurement_type = %s AND measurement_point = %s AND method_id = %s AND name = %s
        """, (kks, measurement_type, point, method_id, model_name))
        max_version = cur.fetchone()[0]
        cur.close()
        conn.close()
        return max_version + 1
    except Exception as e:
        print(f"Error getting next version: {e}")
        return 1

def save_model_info(kks, point, measurement_type, project_name, model_type, model_path, training_metrics=None, parameters=None):
    """Saves model metadata to the database with professional schema."""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cur = conn.cursor()
        
        # 1. Get method_id
        cur.execute("SELECT id FROM ml_methods WHERE name = %s", (model_type.upper(),))
        row = cur.fetchone()
        if not row:
            cur.execute("INSERT INTO ml_methods (name) VALUES (%s) RETURNING id", (model_type.upper(),))
            method_id = cur.fetchone()[0]
        else:
            method_id = row[0]

        # 2. Get next version (never replace — always create new version)
        cur.execute("""
            SELECT COALESCE(MAX(version), 0) FROM ml_models 
            WHERE kks = %s AND measurement_type = %s AND measurement_point = %s AND method_id = %s AND name = %s
        """, (kks, measurement_type, point, method_id, project_name))
        max_version = cur.fetchone()[0]
        version = max_version + 1

        import json
        metrics_json = json.dumps(training_metrics) if training_metrics else None
        params_json = json.dumps(parameters) if parameters else None

        # Deactivate previous versions
        cur.execute("""
            UPDATE ml_models SET is_active = FALSE
            WHERE kks = %s AND measurement_type = %s AND measurement_point = %s AND method_id = %s AND name = %s
        """, (kks, measurement_type, point, method_id, project_name))

        # Insert new version
        cur.execute("""
            INSERT INTO ml_models (kks, measurement_point, measurement_type, method_id, name, model_path, version, training_metrics, parameters, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (kks, point, measurement_type, method_id, project_name, model_path, version, metrics_json, params_json, True))        
        conn.commit()
        cur.close()
        conn.close()
        return True, version
    except Exception as e:
        print(f"Error saving model info to DB: {e}")
        return False

def save_inference_result(wav_path, model_type, mse, status):
    """Saves inference results using the professional ml_results table."""
    conn = get_db_connection()
    if not conn:
        return False
    
    try:
        cur = conn.cursor()
        
        # Try to find a matching active model for this prediction
        # This is a heuristic: pick the latest active model of this type
        cur.execute("""
            SELECT m.id 
            FROM ml_models m
            JOIN ml_methods mt ON m.method_id = mt.id
            WHERE mt.name = %s AND m.is_active = True
            ORDER BY m.created_at DESC LIMIT 1
        """, (model_type.upper(),))
        row = cur.fetchone()
        model_id = row[0] if row else None
        
        cur.execute(
            "INSERT INTO ml_results (model_id, wav_path, mse, status) VALUES (%s, %s, %s, %s)",
            (model_id, wav_path, mse, status)
        )
        conn.commit()
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving to DB: {e}")
        return False

def get_active_model_path(kks, point, measurement_type, model_type):
    """Retrieves the model_path (MinIO bundle path) for the latest active model assigned to the specific sensor point."""
    conn = get_db_connection()
    if not conn:
        return None
        
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT m.model_path 
            FROM ml_models m
            JOIN ml_methods mt ON m.method_id = mt.id
            WHERE m.kks = %s 
              AND m.measurement_point = %s 
              AND m.measurement_type = %s 
              AND mt.name = %s 
              AND m.is_active = True
            ORDER BY m.created_at DESC 
            LIMIT 1
        """, (kks, point, measurement_type, model_type.upper()))
        
        row = cur.fetchone()
        cur.close()
        conn.close()
        
        return row[0] if row else None
    except Exception as e:
        print(f"Error fetching active model path: {e}")
        return None
