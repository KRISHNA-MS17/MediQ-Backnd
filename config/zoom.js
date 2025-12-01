const jwt = require("jsonwebtoken");

const API_KEY = process.env.ZOOM_API_KEY;
const API_SECRET = process.env.ZOOM_API_SECRET;

const generateZoomToken = () => {
  const payload = {
    iss: API_KEY,
    exp: ((new Date()).getTime() + 5000)
  };
  return jwt.sign(payload, API_SECRET);
};

module.exports = generateZoomToken;
