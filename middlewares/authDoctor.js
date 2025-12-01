import jwt from 'jsonwebtoken'

// doctor authentication middleware
const authDoctor = async (req, res, next) => {
    // Express normalizes headers to lowercase, but check both to be safe
    // Use bracket notation to handle any case variations
    const dtoken = req.headers['dtoken'] || req.headers['dToken'] || req.headers.dtoken || req.headers.dToken

    if (!dtoken) {
        console.log('Missing dToken header. Available headers:', Object.keys(req.headers));
        return res.json({ success: false, message: 'Not Authorized Login Again' })
    }

    try {
        const token_decode = jwt.verify(dtoken, process.env.JWT_SECRET)
        req.body.docId = token_decode.id
        next()
    } catch (error) {
        console.log('JWT verification error:', error)
        res.json({ success: false, message: error.message })
    }
}

export default authDoctor;