const express = require("express");
const router = express.Router();
const { createZoomMeeting } = require("../controllers/zoomController");
const { authUser } = require("../middlewares/authUser");

router.post("/create", authUser, createZoomMeeting);

module.exports = router;
