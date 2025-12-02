import validator from "validator";
import bcrypt from "bcrypt";
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModel.js";
import appointmentModel from "../models/appointmentModel.js";
import razorpay from "razorpay";

// API to register user
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // checking for all data to register user
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing Details" });
    }

    // validating email format
    if (!validator.isEmail(email)) {
      return res.json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    // validating strong password
    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Please enter a strong password (minimum 8 characters)",
      });
    }

    // Check if user already exists
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.json({
        success: false,
        message: "Email already registered. Please use a different email or login.",
      });
    }

    // hashing user password
    const salt = await bcrypt.genSalt(10); // the more no. round the more time it will take
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      email,
      password: hashedPassword,
    };

    const newUser = new userModel(userData);
    const user = await newUser.save();
    
    console.log(`✅ New user registered: ${user.name} (${user.email})`);
    
    // Note: We're not returning token anymore since registration redirects to login
    res.json({ 
      success: true, 
      message: "Account created successfully! Please login to continue.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    
    // Handle duplicate key error (MongoDB unique constraint)
    if (error.code === 11000 || error.message.includes("duplicate")) {
      return res.json({
        success: false,
        message: "Email already registered. Please use a different email or login.",
      });
    }
    
    res.json({ 
      success: false, 
      message: error.message || "Registration failed. Please try again." 
    });
  }
};

// API to login user
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user profile data
const getProfile = async (req, res) => {
  try {
    const { userId } = req.body;
    const userData = await userModel.findById(userId).select("-password");

    res.json({ success: true, userData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update user profile
const updateProfile = async (req, res) => {
  try {
    const { userId, name, phone, address, dob, gender, email } = req.body;
    const imageFile = req.file;

    // Validation
    if (!name || name.trim() === '') {
      return res.json({ success: false, message: "Name is required" });
    }

    if (!phone || phone.trim() === '') {
      return res.json({ success: false, message: "Phone is required" });
    }

    // Validate phone format (basic)
    const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return res.json({ success: false, message: "Please enter a valid phone number" });
    }

    // Validate email if provided
    if (email && !validator.isEmail(email)) {
      return res.json({ success: false, message: "Please enter a valid email" });
    }

    // Validate DOB if provided
    if (dob) {
      const dobDate = new Date(dob);
      const today = new Date();
      if (dobDate > today) {
        return res.json({ success: false, message: "Date of birth cannot be in the future" });
      }
    }

    // Prepare update data
    const updateData = {
      name: name.trim(),
      phone: phone.trim(),
    };

    if (email) updateData.email = email.trim();
    if (dob) updateData.dob = dob;
    if (gender) updateData.gender = gender;

    // Handle address (can be string JSON or object)
    if (address) {
      try {
        updateData.address = typeof address === 'string' ? JSON.parse(address) : address;
      } catch (e) {
        // If parsing fails, treat as simple string
        updateData.address = { line1: address, line2: '' };
      }
    }

    // Update profile
    await userModel.findByIdAndUpdate(userId, updateData);

    // Handle image upload if provided
    if (imageFile) {
      try {
        // Upload image to cloudinary
        const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
          resource_type: "image",
          folder: "user-profiles",
        });
        const imageURL = imageUpload.secure_url;

        await userModel.findByIdAndUpdate(userId, { image: imageURL });
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        // Continue even if image upload fails, but log it
      }
    }

    // Fetch updated user data
    const updatedUser = await userModel.findById(userId).select('-password');

    res.json({ 
      success: true, 
      message: "Profile Updated",
      userData: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.json({ success: false, message: error.message || "Failed to update profile" });
  }
};

// API to book appointment
const bookAppointment = async (req, res) => {
  try {
    const { userId, docId, slotDate, slotTime, travelTime } = req.body;
    const docData = await doctorModel.findById(docId).select("-password");

    if (!docData.available) {
      return res.json({ success: false, message: "Doctor Not Available" });
    }

    let slots_booked = docData.slots_booked;

    // checking for slot availablity
    if (slots_booked[slotDate]) {
      if (slots_booked[slotDate].includes(slotTime)) {
        return res.json({ success: false, message: "Slot Not Available" });
      } else {
        slots_booked[slotDate].push(slotTime);
      }
    } else {
      slots_booked[slotDate] = [];
      slots_booked[slotDate].push(slotTime);
    }

    const userData = await userModel.findById(userId).select("-password");

    delete docData.slots_booked;

    // Get queue status for the day to assign token number
    const queueStatus = docData.queueStatus[slotDate] || { currentToken: 0, totalTokens: 0 };
    const nextTokenNumber = queueStatus.totalTokens + 1;

    // Calculate estimated wait time
    const avgTime = docData.averageDiagnosisTime || 10;
    const currentToken = queueStatus.currentToken || 0;
    const estimatedWaitTime = (nextTokenNumber - currentToken) * avgTime;

    // Use auto-calculated travelTime from frontend, fallback to 15 minutes if missing
    const finalTravelTime = travelTime ? parseInt(travelTime) : 15;

    const appointmentData = {
      userId,
      docId,
      userData,
      docData,
      amount: docData.fees,
      slotTime,
      slotDate,
      date: Date.now(),
      tokenNumber: nextTokenNumber,
      travelTime: finalTravelTime,
      estimatedWaitTime
    };

    const newAppointment = new appointmentModel(appointmentData);
    await newAppointment.save();

    // Update doctor's queue status
    const updatedQueueStatus = {
      ...docData.queueStatus,
      [slotDate]: {
        currentToken: queueStatus.currentToken || 0,
        totalTokens: nextTokenNumber
      }
    };

    await doctorModel.findByIdAndUpdate(docId, { 
      slots_booked,
      queueStatus: updatedQueueStatus
    });

    // Schedule notifications
    const { scheduleNotifications } = await import('../services/notificationService.js');
    await scheduleNotifications(newAppointment._id.toString());

    res.json({ 
      success: true, 
      message: "Appointment Booked",
      appointment: {
        tokenNumber: nextTokenNumber,
        estimatedWaitTime
      }
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user appointments for frontend my-appointments page
const listAppointment = async (req, res) => {
  try {
    const { userId } = req.body;
    const appointments = await appointmentModel.find({ userId });

    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user appointment history (past appointments with pagination)
const getAppointmentHistory = async (req, res) => {
  try {
    const { userId } = req.body;
    const { page = 1, pageSize = 20, filter = 'past' } = req.query;
    
    const pageNum = parseInt(page);
    const limit = parseInt(pageSize);
    const skip = (pageNum - 1) * limit;

    // Build query based on filter
    const now = new Date();
    const query = { userId };

    if (filter === 'past') {
      query.$or = [
        { slotDate: { $lt: now.toISOString().split('T')[0] } },
        { date: { $lt: now.getTime() } },
        { status: 'COMPLETED' }
      ];
      query.status = { $ne: 'CANCELLED' };
    } else if (filter === 'cancelled') {
      query.status = 'CANCELLED';
      query.cancelled = true;
    }
    // 'all' shows everything

    const appointments = await appointmentModel
      .find(query)
      .sort({ date: -1, slotDate: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await appointmentModel.countDocuments(query);

    // Format appointments for response
    const formattedAppointments = appointments.map(apt => ({
      appointmentId: apt._id.toString(),
      doctorName: apt.docData?.name || 'Unknown Doctor',
      specialization: apt.docData?.speciality || 'General Physician',
      tokenNumber: apt.slotTokenIndex ? `#${apt.slotTokenIndex}` : apt.tokenNumber ? `#${apt.tokenNumber}` : 'N/A',
      time: apt.estimatedStart ? new Date(apt.estimatedStart).toISOString() : apt.date ? new Date(apt.date).toISOString() : null,
      status: apt.status || (apt.cancelled ? 'cancelled' : apt.isCompleted ? 'completed' : 'booked'),
      notes: apt.notes || null,
      prescriptionUrl: apt.prescriptionUrl || null,
      invoiceUrl: apt.invoiceUrl || null,
      hospital: apt.docData?.address ? {
        name: apt.docData?.address?.hospitalName || 'Hospital',
        phone: apt.docData?.phone || '',
        address: typeof apt.docData.address === 'object' 
          ? `${apt.docData.address.line1 || ''}, ${apt.docData.address.line2 || ''}, ${apt.docData.address.city || ''}, ${apt.docData.address.state || ''}`.trim()
          : apt.docData.address || ''
      } : null,
      slotDate: apt.slotDate,
      slotTime: apt.slotTime,
      amount: apt.amount,
      payment: apt.payment
    }));

    res.json({
      success: true,
      items: formattedAppointments,
      page: pageNum,
      pageSize: limit,
      total
    });
  } catch (error) {
    console.error('Error getting appointment history:', error);
    res.json({ success: false, message: error.message });
  }
};

// API to cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const { userId, appointmentId } = req.body;
    const appointmentData = await appointmentModel.findById(appointmentId);

    // verify appointment user
    if (appointmentData.userId !== userId) {
      return res.json({ success: false, message: "Unauthorized action" });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    // releasing doctor slot
    const { docId, slotDate, slotTime } = appointmentData;

    const doctorData = await doctorModel.findById(docId);

    let slots_booked = doctorData.slots_booked;

    slots_booked[slotDate] = slots_booked[slotDate].filter(
      (e) => e !== slotTime
    );

    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    res.json({ success: true, message: "Appointment Cancelled" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get queue status for patient
const getPatientQueueStatus = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res.json({ success: false, message: "Appointment not found" });
    }

    const doctor = await doctorModel.findById(appointment.docId);
    if (!doctor) {
      return res.json({ success: false, message: "Doctor not found" });
    }

    const queueStatus = doctor.queueStatus[appointment.slotDate] || { currentToken: 0, totalTokens: 0 };
    const currentToken = queueStatus.currentToken || 0;
    const patientToken = appointment.tokenNumber;
    const avgTime = doctor.averageDiagnosisTime || 10;

    // Calculate updated wait time
    const estimatedWaitTime = Math.max(0, (patientToken - currentToken) * avgTime);

    // Update appointment with new wait time
    await appointmentModel.findByIdAndUpdate(appointmentId, {
      estimatedWaitTime
    });

    res.json({
      success: true,
      queueStatus: {
        currentToken,
        patientToken,
        estimatedWaitTime,
        averageDiagnosisTime: avgTime,
        positionInQueue: Math.max(0, patientToken - currentToken)
      }
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update travel time for an appointment
const updateTravelTime = async (req, res) => {
  try {
    const { appointmentId, travelTime } = req.body;
    const appointment = await appointmentModel.findById(appointmentId);

    if (!appointment) {
      return res.json({ success: false, message: "Appointment not found" });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      travelTime: parseInt(travelTime)
    });

    // Reschedule notifications with new travel time
    const { scheduleNotifications } = await import('../services/notificationService.js');
    await scheduleNotifications(appointmentId);

    res.json({ success: true, message: "Travel time updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to make payment of appointment using razorpay
const paymentRazorpay = async (req, res) => {
  try {
    if (!razorpayInstance) {
      return res.json({
        success: false,
        message: "Razorpay is not configured. Please check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.",
      });
    }

    const { appointmentId } = req.body;
    const appointmentData = await appointmentModel.findById(appointmentId);

    if (!appointmentData || appointmentData.cancelled) {
      return res.json({
        success: false,
        message: "Appointment Cancelled or not found",
      });
    }

    // creating options for razorpay payment
    const options = {
      amount: appointmentData.amount * 100,
      currency: process.env.CURRENCY || "INR",
      receipt: appointmentId,
    };

    // creation of an order
    const order = await razorpayInstance.orders.create(options);

    res.json({ success: true, order });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to verify payment of razorpay
const verifyRazorpay = async (req, res) => {
  try {
    if (!razorpayInstance) {
      return res.json({
        success: false,
        message: "Razorpay is not configured. Please check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.",
      });
    }

    const { razorpay_order_id } = req.body;
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);

    if (orderInfo.status === "paid") {
      await appointmentModel.findByIdAndUpdate(orderInfo.receipt, {
        payment: true,
      });
      res.json({ success: true, message: "Payment Successful" });
    } else {
      res.json({ success: false, message: "Payment Failed" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Gateway Initialize
let razorpayInstance = null;

try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpayInstance = new razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log('✅ Razorpay initialized successfully');
  } else {
    console.warn('⚠️ Razorpay keys not found in environment variables');
  }
} catch (error) {
  console.error('❌ Failed to initialize Razorpay:', error.message);
}

export {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointment,
  getAppointmentHistory,
  cancelAppointment,
  getPatientQueueStatus,
  updateTravelTime,
  paymentRazorpay,
  verifyRazorpay,
};
