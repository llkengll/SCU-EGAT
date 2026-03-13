import axios from 'axios';
import { clearUserData } from './auth';

// Create Axios instance
const apiClient = axios.create();

// Request interceptor to add the auth token header to every request
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle 401 Unauthorized errors
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            // Check if we are already on login page to avoid infinite loops
            if (window.location.pathname !== '/login') {
                console.log('Unauthorized request. Logging out...');
                clearUserData();
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default apiClient;
