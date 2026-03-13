-- Initial schema for SCU Web App
-- Based on db.md

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- admin, operator, viewer
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE machine_master (
  kks VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(100) NOT NULL,
  plant VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE machine_config (
  kks VARCHAR(100) PRIMARY KEY REFERENCES machine_master(kks),
  measurement_point INT NOT NULL,
  measurement_interval INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE machine_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  kks VARCHAR(100) REFERENCES machine_config(kks),
  file_name VARCHAR(255) NOT NULL,
  measurement_type VARCHAR(100) NOT NULL,
  measurement_point INT,
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  location VARCHAR(100),
  abnormal_case VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kks, file_name)
);

CREATE INDEX idx_machine_logs_kks ON machine_logs(kks);
CREATE INDEX idx_machine_logs_user_id ON machine_logs(user_id);

CREATE TABLE ml_methods (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE, -- CNN, SVM, Autoencoder
  description TEXT
);

CREATE TABLE ml_models (
  id SERIAL PRIMARY KEY,
  kks VARCHAR(100) REFERENCES machine_config(kks),
  measurement_point INT,
  measurement_type VARCHAR(100), -- vibration, sound
  method_id INTEGER REFERENCES ml_methods(id),
  name VARCHAR(255) NOT NULL, -- project/model name
  version INT NOT NULL DEFAULT 1,
  alert_threshold DECIMAL DEFAULT 1000000, -- 1e6
  model_path VARCHAR(500) NOT NULL, -- MinIO path
  status VARCHAR(50) DEFAULT 'completed', -- training, completed, failed, active, archived
  training_metrics JSONB, -- MSE, Loss, etc.
  parameters JSONB, -- Hyperparameters
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kks, measurement_type, measurement_point, method_id, name, version)
);

CREATE INDEX idx_ml_models_kks ON ml_models(kks);
CREATE INDEX idx_ml_models_method_id ON ml_models(method_id);

CREATE TABLE alert_logs (
  id SERIAL PRIMARY KEY,
  machine_log_id INTEGER REFERENCES machine_logs(id),
  kks VARCHAR(100) REFERENCES machine_config(kks),
  measurement_point INT NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  measurement_type VARCHAR(50),
  is_anomaly BOOLEAN DEFAULT FALSE,
  abnormal_case VARCHAR(255),
  percent_match DECIMAL(5, 2),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kks, measurement_point)
);

CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
    device_name VARCHAR(255) NOT NULL,
    device_gain_vibration DECIMAL(10, 3) DEFAULT 1.000,
    device_gain_sound DECIMAL(10, 3) DEFAULT 1.000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Basic triggers for updated_at (optional but good practice)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_machine_master_updated_at BEFORE UPDATE ON machine_master FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_machine_config_updated_at BEFORE UPDATE ON machine_config FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_alert_logs_updated_at BEFORE UPDATE ON alert_logs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Seed data for ml_methods
INSERT INTO ml_methods (name, description) VALUES 
('AE', 'Autoencoder for unsupervised anomaly detection'),
('PCA', 'Principal Component Analysis for anomaly detection'),
('VAE', 'Variational Autoencoder for anomaly detection');

-- Seed data for default admin user (password: password)
INSERT INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@egat.co.th', '$2a$10$Dv6Wd4aroyE1K4rW3I41Bek5PzddyPkZueeJ9NV9bqnoLPL9WuGqu', 'admin');

-- Seed data for mock machines
INSERT INTO machine_master (kks, name, unit, plant) VALUES
('MAE-GT-001', 'Gas Turbine Unit 1', 'Unit 4', 'Mae Moh Power Plant'),
('MAE-GT-002', 'Gas Turbine Unit 2', 'Unit 5', 'Mae Moh Power Plant'),
('MAE-ST-001', 'Steam Turbine Unit 1', 'Unit 4', 'Mae Moh Power Plant'),
('MAE-FN-001', 'Cooling Fan A', 'Unit 4', 'Mae Moh Power Plant'),
('MAE-PM-001', 'Feed Water Pump 1', 'Unit 5', 'Mae Moh Power Plant');

INSERT INTO machine_config (kks, measurement_point, measurement_interval) VALUES
('MAE-GT-001', 6, 3),
('MAE-GT-002', 6, 30),
('MAE-ST-001', 8, 45),
('MAE-FN-001', 4, 10),
('MAE-PM-001', 5, 25);
