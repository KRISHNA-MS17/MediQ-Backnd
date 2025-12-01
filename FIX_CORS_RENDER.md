# 🔧 Fix CORS Error on Render

## ❌ The Problem

When deploying to Render, you're getting CORS errors:
```
Access to XMLHttpRequest at 'https://mediq-backnd.onrender.com/api/doctor/list' 
from origin 'http://localhost:5175' has been blocked by CORS policy: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## ✅ The Solution

The CORS configuration has been updated to:
1. **Allow all origins by default** (both development and production)
2. **Only restrict origins** if `ALLOWED_ORIGINS` environment variable is explicitly set in Render

---

## 🚀 What Changed

The backend CORS configuration now:
- Allows all origins by default (when `ALLOWED_ORIGINS` is not set)
- Only restricts origins if you explicitly set `ALLOWED_ORIGINS` in Render
- Works for both development and production

---

## 📝 Render Environment Variables

### Option 1: Allow All Origins (Current - Recommended)
**Don't set `ALLOWED_ORIGINS`** - the backend will allow all origins automatically.

### Option 2: Restrict to Specific Origins
If you want to restrict access, set `ALLOWED_ORIGINS` in Render:
```
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,https://your-frontend-domain.com
```

---

## 🔄 Next Steps

1. **Commit and push the updated `server.js`:**
   ```bash
   cd backend
   git add server.js
   git commit -m "Fix CORS configuration for Render"
   git push origin main
   ```

2. **Render will auto-deploy** the changes

3. **Test again** - CORS errors should be gone!

---

## ✅ After Fix

The backend will now accept requests from:
- ✅ `http://localhost:5173` (frontend)
- ✅ `http://localhost:5174` (admin)
- ✅ `http://localhost:5175` (any other local dev server)
- ✅ Any other origin (unless `ALLOWED_ORIGINS` is set)

---

## 🎯 Summary

- **Before:** CORS blocked requests in production
- **After:** CORS allows all origins by default
- **Action:** Push the updated code to trigger Render redeploy

