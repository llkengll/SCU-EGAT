// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const API_ENDPOINTS = {
    AUTH: {
        LOGIN: `${API_BASE_URL}/api/auth/login`,
    },
    MACHINES: {
        GET_BY_KKS: (kks) => `${API_BASE_URL}/api/machines/${kks}`,
        CREATE_LOG: `${API_BASE_URL}/api/machines/logs`,
        GET_ALERTS: `${API_BASE_URL}/api/machines/alerts/all`,
    },
    UPLOAD_TRAIN: `${API_BASE_URL}/api/upload/train`,
    UPLOAD_ALL: `${API_BASE_URL}/api/upload/all`,
    ML: {
        TRAIN_ALL: `${API_BASE_URL}/ml/v1/train_all`,
        CHECK_MODEL: `${API_BASE_URL}/ml/v1/check_model`,
        NEXT_VERSION: `${API_BASE_URL}/ml/v1/next_version`,
        GET_MODELS: `${API_BASE_URL}/api/ml/models`,
        PREDICT_TEST_ALL: `${API_BASE_URL}/api/ml/predict-test-all`,
    },
};

export default API_ENDPOINTS;
