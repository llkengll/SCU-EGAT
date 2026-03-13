import os
from minio import Minio
from dotenv import load_dotenv

load_dotenv()

minio_endpoint = os.getenv('MINIO_ENDPOINT', 'localhost')
minio_port = os.getenv('MINIO_PORT', '9000')

endpoint_str = minio_endpoint if ":" in minio_endpoint else f"{minio_endpoint}:{minio_port}"

client = Minio(
    endpoint_str,
    access_key=os.getenv('MINIO_ACCESS_KEY', 'minioadmin'),
    secret_key=os.getenv('MINIO_SECRET_KEY', 'minioadmin'),
    secure=False
)

def download_audio(bucket_name, object_name):
    """Downloads an audio file from MinIO to a temporary local path."""
    import tempfile
    
    tmp_dir = tempfile.gettempdir()
    local_path = os.path.join(tmp_dir, os.path.basename(object_name))
    
    try:
        client.fget_object(bucket_name, object_name, local_path)
        return local_path
    except Exception as e:
        print(f"Error downloading from MinIO: {e}")
        return None

def download_folder(bucket_name, prefix):
    """Downloads all objects with a given prefix from MinIO to a temporary local folder."""
    import tempfile
    import shutil
    
    tmp_dir = tempfile.mkdtemp()
    
    try:
        objects = client.list_objects(bucket_name, prefix=prefix, recursive=True)
        count = 0
        for obj in objects:
            if obj.object_name.endswith('/'):
                continue
            
            # Create subdirectories if needed
            rel_path = os.path.relpath(obj.object_name, prefix)
            local_file_path = os.path.join(tmp_dir, rel_path)
            os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
            
            client.fget_object(bucket_name, obj.object_name, local_file_path)
            count += 1
        
        return tmp_dir if count > 0 else None
    except Exception as e:
        print(f"Error downloading folder from MinIO: {e}")
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir)
        return None

def upload_file(bucket_name, object_name, local_path):
    """Uploads a local file to MinIO."""
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
        
        client.fput_object(bucket_name, object_name, local_path)
        return True
    except Exception as e:
        print(f"Error uploading to MinIO: {e}")
        return False

def check_prefix_exists(bucket_name, prefix):
    """Checks if any objects exist with the given prefix in MinIO."""
    try:
        objects = client.list_objects(bucket_name, prefix=prefix, recursive=True)
        # Check if the generator returns at least one object
        for _ in objects:
            return True
        return False
    except Exception as e:
        print(f"Error checking prefix in MinIO: {e}")
        return False
