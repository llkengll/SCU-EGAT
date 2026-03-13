import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import infoEngy from '../assets/ENGY/engy1-01.png';
import successEngy from '../assets/ENGY/engy11-01.png';
import warningEngy from '../assets/ENGY/engy24-01.png';
import errorEngy from '../assets/ENGY/engy18.png';
import questionEngy from '../assets/ENGY/engy34.png';

const AlertContext = createContext();

export const useAlert = () => {
  return useContext(AlertContext);
};

export const AlertProvider = ({ children }) => {
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: '',
    text: '',
    icon: 'info',
    showCancelButton: false,
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#1e3a8a',
    cancelButtonColor: '#ef4444',
    resolvePromise: null,
  });

  const fire = useCallback((...args) => {
    return new Promise((resolve) => {
      let parsedOptions = {};
      
      if (args.length === 0) return;

      if (typeof args[0] === 'string') {
        parsedOptions = {
          title: args[0] || '',
          text: args[1] || '',
          icon: args[2] || 'info',
        };
      } else {
        parsedOptions = args[0] || {};
      }
      
      setAlertState({
        isOpen: true,
        title: parsedOptions.title || '',
        text: parsedOptions.text || '',
        icon: parsedOptions.icon || 'info',
        showCancelButton: parsedOptions.showCancelButton || false,
        confirmButtonText: parsedOptions.confirmButtonText || 'OK',
        cancelButtonText: parsedOptions.cancelButtonText || 'Cancel',
        confirmButtonColor: parsedOptions.confirmButtonColor || '#1e3a8a',
        cancelButtonColor: parsedOptions.cancelButtonColor || '#ef4444',
        resolvePromise: resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    setAlertState((prev) => {
      if (prev.resolvePromise) prev.resolvePromise({ isConfirmed: true, isDenied: false, isDismissed: false });
      return { ...prev, isOpen: false };
    });
  };

  const handleCancel = () => {
    setAlertState((prev) => {
      if (prev.resolvePromise) prev.resolvePromise({ isConfirmed: false, isDenied: false, isDismissed: true });
      return { ...prev, isOpen: false };
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && alertState.isOpen) {
        handleCancel();
      }
      if (e.key === 'Enter' && alertState.isOpen) {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [alertState.isOpen]);

  const getEngyMascot = (icon) => {
    switch (icon) {
      case 'success': return successEngy;
      case 'error': return errorEngy;
      case 'warning': return warningEngy;
      case 'question': return questionEngy;
      case 'info':
      default: return infoEngy;
    }
  };

  const contextValue = useMemo(() => ({ fire }), [fire]);

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {alertState.isOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={handleCancel}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl shadow-2xl rounded-[2rem] p-8 overflow-hidden flex flex-col items-center text-center border border-white/60"
            >
              {/* Mascot Image */}
              <div className="w-36 h-36 mb-4 drop-shadow-xl relative">
                <motion.img 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 12 }}
                  src={getEngyMascot(alertState.icon)} 
                  alt="ENGY Mascot" 
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Title */}
              {alertState.title && (
                <h2 className="text-2xl font-black mb-2 text-slate-800 tracking-tight">
                  {alertState.title}
                </h2>
              )}

              {/* Text */}
              {alertState.text && (
                <p className="text-slate-500 mb-6 font-medium leading-relaxed">
                  {alertState.text}
                </p>
              )}

              {/* Buttons */}
              <div className="flex gap-3 w-full justify-center mt-2">
                {alertState.showCancelButton && (
                  <button
                    onClick={handleCancel}
                    className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/10 cursor-pointer ${
                      alertState.cancelButtonColor === '#ffffff' || alertState.cancelButtonColor === 'white'
                        ? 'text-slate-600 border border-slate-200'
                        : 'text-white'
                    }`}
                    style={{ backgroundColor: alertState.cancelButtonColor }}
                  >
                    {alertState.cancelButtonText}
                  </button>
                )}
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-black/10 cursor-pointer"
                  style={{ backgroundColor: alertState.confirmButtonColor }}
                >
                  {alertState.confirmButtonText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AlertContext.Provider>
  );
};
