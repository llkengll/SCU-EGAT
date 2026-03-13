import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router';
import { AlertProvider } from './context/AlertContext';
import MainLayout from './components/MainLayout';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CreateModelPage from './pages/CreateModelPage';
import MeasurementPage from './pages/MeasurementPage';
import DashboardPage from './pages/DashboardPage';
import CalibratePage from './pages/CalibratePage';
import DatabaseManagerPage from './pages/DatabaseManagerPage';

function App() {
  return (
    <BrowserRouter>
      <AlertProvider>
        <MainLayout>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/CreateModelPage" element={<CreateModelPage />} />
            <Route path="/MeasurementPage" element={<MeasurementPage />} />
            <Route path="/Dashboard" element={<DashboardPage />} />
            <Route path="/CalibratePage" element={<CalibratePage />} />
            <Route path="/DatabaseManagerPage" element={<DatabaseManagerPage />} />
          </Routes>
        </MainLayout>
      </AlertProvider>
    </BrowserRouter>
  );
}

export default App;
