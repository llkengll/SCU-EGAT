import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router';

import engyDefault from '../assets/ENGY/engyB.png';
import engyLogin from '../assets/ENGY/engy1-01.png';
import engyHome from '../assets/ENGY/engy4.png';
import engyMeasure from '../assets/ENGY/engy37.png';
import engyAdmin from '../assets/ENGY/engy7.png';

const Mascot = () => {
  const location = useLocation();
  const [currentMascot, setCurrentMascot] = useState(engyDefault);
  const [message, setMessage] = useState("I'm ENGY! How can I help?");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const path = location.pathname;
    if (path === '/login') {
      setCurrentMascot(engyLogin);
      setMessage("Welcome to SCU!");
    } else if (path === '/') {
      setCurrentMascot(engyHome);
      setMessage("Ready to start measurement?");
    } else if (path === '/MeasurementPage') {
      setCurrentMascot(engyMeasure);
      setMessage("Monitoring signals...");
    } else if (path.startsWith('/admin')) {
      setCurrentMascot(engyAdmin);
      setMessage("System Settings Mode");
    } else {
      setCurrentMascot(engyDefault);
      setMessage("I'm ENGY! How can I help?");
    }
    setIsVisible(true);
  }, [location.pathname]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ 
            opacity: 1, 
            scale: 1, 
            y: 0,
            transition: {
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.5
            }
          }}
          exit={{ opacity: 0, scale: 0.5, y: 50 }}
          whileHover={{ 
            scale: 1.1,
            transition: { duration: 0.2 }
          }}
          className="fixed bottom-4 right-4 md:bottom-8 md:right-8 z-[9999] flex flex-col items-end gap-2"
        >
          <motion.div
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            onClick={() => setIsVisible(false)}
            className="relative group pointer-events-auto cursor-pointer"
          >
            {/* Subtle Glow Effect */}
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-75 group-hover:scale-110 transition-transform duration-500"></div>
            
            <img 
              src={currentMascot} 
              alt="ENGY Mascot" 
              className="h-20 w-auto md:h-36 lg:h-44 relative z-10 drop-shadow-2xl filter contrast-[1.05] brightness-[1.02] transform-gpu"
              style={{ userSelect: 'none' }}
              draggable="false"
            />
            
            {/* Tooltip-like badge */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileHover={{ opacity: 1, x: 0 }}
              className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-white/95 backdrop-blur-md border border-slate-200 px-4 py-2 rounded-2xl shadow-xl hidden md:block whitespace-nowrap"
            >
              <p className="text-primary font-extrabold text-[10px] uppercase tracking-wider">{message}</p>
              <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-white/95 rotate-45 border-t border-r border-slate-200"></div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Mascot;
