export const clearUserData = () => {
    const keysToRemove = ['token', 'user_id', 'role', 'username'];
    keysToRemove.forEach(key => localStorage.removeItem(key));
};
