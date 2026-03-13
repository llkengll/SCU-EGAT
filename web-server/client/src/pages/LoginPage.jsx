import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../config/axios';
import { motion, AnimatePresence } from 'framer-motion';
import egatlogo from '../assets/LogoEGAT-TH-1536x513.png';
import { API_ENDPOINTS } from '../config/api';

const LoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    apiClient.post(API_ENDPOINTS.AUTH.LOGIN, { username, password })
      .then(response => {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user_id', response.data.user.id);
        localStorage.setItem('role', response.data.user.role);
        localStorage.setItem('username', response.data.user.username);
        navigate('/');
      })
      .catch(error => {
        console.error('Login failed:', error);
        if (error.response) {
          setError(error.response.status === 401 ? 'Invalid username or password' : 'Server error. Please try again.');
        } else if (error.request) {
          setError('Network error. Check your connection.');
        } else {
          setError('An unexpected error occurred.');
        }
        setIsLoading(false);
      });
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) navigate('/');
  }, [navigate]);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center relative overflow-hidden selection:bg-primary/10 selection:text-primary">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0 bg-slate-50">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5"></div>
        {/* Decorative Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#1e3a8a 0.5px, transparent 0.5px), linear-gradient(90deg, #1e3a8a 0.5px, transparent 0.5px)', backgroundSize: '40px 40px' }}></div>
      </div>

      {/* Main Login Card Container */}
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-[440px] p-4"
      >
        <div className="bg-white rounded-[3rem] p-8 md:p-10 border border-white/60 shadow-[0_50px_80px_-20px_rgba(30,58,138,0.12)] relative overflow-hidden backdrop-blur-3xl">
          {/* Subtle Decorative Gradient */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-secondary/10 rounded-full -mr-24 -mt-24 blur-3xl"></div>
          
          <div className="relative z-10">
            {/* Header / Logo Section */}
            <div className="text-center mb-8">
              <motion.img 
                src={egatlogo}  
                alt="EGAT" 
                className="h-12 w-auto mx-auto mb-6"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              />
              <div className="space-y-1.5">
                <h1 className="text-3xl font-black text-primary tracking-tight">
                  SCU <span className="text-secondary-dark">Sign In</span>
                </h1>
                <div className="h-1 w-10 bg-secondary mx-auto rounded-full mt-1.5"></div>
                <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-3">
                  Smart Signal Conditioning Unit
                </p>
              </div>
            </div>

            {/* Notification Area */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6 p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl flex items-center gap-3.5 text-[13px] font-bold"
                >
                  <svg className="h-4.5 w-4.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{error}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4.5">
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">
                  Username
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 pl-12 pr-4 text-primary font-bold focus:bg-white focus:border-primary focus:ring-8 focus:ring-primary/5 transition-all outline-none placeholder:text-slate-300 text-sm "
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-300 group-focus-within:text-primary transition-colors">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">
                  Password
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 pl-12 pr-12 text-primary font-bold focus:bg-white focus:border-primary focus:ring-8 focus:ring-primary/5 transition-all outline-none placeholder:text-slate-300 text-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-slate-300 group-focus-within:text-primary transition-colors">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-4 flex items-center text-slate-300 hover:text-primary transition-colors focus:outline-none"
                  >
                    {showPassword ? (
                      <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-secondary py-4.5 rounded-2xl shadow-[0_20px_40px_-12px_rgba(250,204,21,0.35)] transition-all hover:bg-secondary-light flex items-center justify-center gap-3.5 group"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="text-primary font-black text-[10px] uppercase tracking-[0.4em]">Login</span>
                    <svg className="h-4.5 w-4.5 text-primary transform group-hover:translate-x-1.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </>
                )}
              </motion.button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col items-center gap-4.5">
              <div className="flex flex-col items-center gap-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Electricity Generating Authority</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;