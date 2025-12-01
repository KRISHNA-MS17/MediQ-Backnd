import jwt from "jsonwebtoken"

// admin authentication middleware
const authAdmin = async (req, res, next) => {
    try {
        // Handle both lowercase and camelCase header names
        const atoken = req.headers['atoken'] || req.headers['aToken'] || req.headers.atoken || req.headers.aToken
        
        if (!atoken) {
            console.log('Missing aToken header. Available headers:', Object.keys(req.headers));
            return res.json({ success: false, message: 'Not Authorized Login Again' })
        }
        
        const token_decode = jwt.verify(atoken, process.env.JWT_SECRET || 'doctalk')
        const expectedToken = (process.env.ADMIN_EMAIL || 'admin@gmail.com') + (process.env.ADMIN_PASSWORD || 'docplus123')
        
        if (token_decode !== expectedToken) {
            return res.json({ success: false, message: 'Not Authorized Login Again' })
        }
        next()
    } catch (error) {
        console.log('AuthAdmin error:', error)
        res.json({ success: false, message: error.message })
    }
}

export default authAdmin;