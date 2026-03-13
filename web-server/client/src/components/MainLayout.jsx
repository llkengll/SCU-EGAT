import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import Mascot from './Mascot';
import egatlogo from '../assets/LogoEGAT-TH-1536x513.png';
import { clearUserData } from '../config/auth';


const MainLayout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const username = localStorage.getItem('username') || 'User';

  const isLoginPage = location.pathname === '/login';

  const getPageConfig = (pathname) => {
    switch (pathname) {
      case '/':
        return { title: 'Station', type: 'home' };
      case '/CreateModelPage':
        return { title: 'Model Studio', type: 'page' };
      case '/MeasurementPage':
        return { title: 'Measurement', type: 'page' };
      case '/Dashboard':
        return { title: 'Dashboard', type: 'dashboard' };
      case '/CalibratePage':
        return { title: 'Lab Studio', type: 'page' };
      case '/DatabaseManagerPage':
        return { title: 'Database Admin', type: 'page' };
      default:
        return { title: 'System', type: 'page' };
    }
  };

  const config = getPageConfig(location.pathname);

  const handleLogout = () => {
    // We could use Swal here if we want confirmation, 
    // but for now a direct logout or a custom event is fine.
    // Given the user wants it professional, I'll use a custom event 
    // so pages can trigger their own confirmed logout if they want, 
    // or just handle it here.
    window.dispatchEvent(new CustomEvent('egat:logout'));
    if (!window.hasLogoutListener) {
        clearUserData();
        navigate('/login');
    }
  };

  const handleExit = () => {
    const event = new CustomEvent('egat:exit', { cancelable: true });
    const wasPrevented = !window.dispatchEvent(event);
    if (!wasPrevented) {
      navigate('/');
    }
  };

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('egat:refresh'));
  };

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col items-center">
      {!isLoginPage && (
        <motion.header 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-7xl flex items-center justify-between px-4 sm:px-8 py-6 z-50"
        >
          <div className="flex items-center gap-4">
            <img src={egatlogo} alt="EGAT" className="h-10 md:h-12 w-auto object-contain hover:scale-105 transition-transform duration-500" />
            <div className="h-10 w-px bg-slate-200"></div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-primary font-black text-sm md:text-2xl tracking-tighter uppercase">SCU <span className="text-secondary-dark">{config.title}</span></h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <p className="text-slate-900 font-black text-sm leading-none">{username}</p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">


              {config.type === 'home' ? (
                <button 
                  onClick={handleLogout}
                  className="p-3 sm:px-5 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 rounded-2xl text-primary hover:text-rose-500 hover:border-rose-100 transition-all duration-300 font-bold text-sm flex items-center gap-2 group active:scale-95"
                >
                  <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              ) : (
                <button 
                  onClick={handleExit}
                  className="p-3 sm:px-5 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-200 rounded-2xl text-primary hover:text-rose-500 hover:border-rose-100 transition-all duration-300 font-bold text-sm flex items-center gap-2 group active:scale-95"
                >
                  <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                  <span className="hidden sm:inline">Exit to Home</span>
                </button>
              )}
            </div>
          </div>
        </motion.header>
      )}
      <main className="w-full flex-1 flex flex-col items-center">
        {children}
      </main>
      <Mascot />
    </div>
  );
};

export default MainLayout;
