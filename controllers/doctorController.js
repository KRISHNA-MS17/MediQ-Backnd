import doctorModel from "../models/doctorModel.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import appointmentModel from "../models/appointmentModel.js";

// API to change doctor availablity for Admin and Doctor Panel
const changeAvailablity = async (req, res) => {
  try {
    const { docId } = req.body;

    const docData = await doctorModel.findById(docId);
    await doctorModel.findByIdAndUpdate(docId, {
      available: !docData.available,
    });
    res.json({ success: true, message: "Availablity Changed" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get all doctors list for Frontend
const doctorList = async (req, res) => {
  try {
    const doctors = await doctorModel.find({}).select(["-password", "-email"]);
    res.json({ success: true, doctors });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API for doctor Login
const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    const doctor = await doctorModel.findOne({ email });

    if (!doctor) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, doctor.password);

    if (isMatch) {
      const token = jwt.sign({ id: doctor._id }, process.env.JWT_SECRET || 'doctalk');
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get doctor appointments for doctor panel
const appointmentsDoctor = async (req, res) => {
  try {
    const { docId } = req.body;
    const appointments = await appointmentModel.find({ docId });

    res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to mark appointment completed for doctor panel
const appointmentComplete = async (req, res) => {
  try {
    const { docId, appointmentId } = req.body;

    const appointmentData = await appointmentModel.findById(appointmentId);
    if (appointmentData && appointmentData.docId === docId) {
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        isCompleted: true,
      });
      return res.json({ success: true, message: "Appointment Completed" });
    }

    res.json({ success: false, message: "Appointment Cancelled" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to cancel appointment for doctor panel
const appointmentCancel = async (req, res) => {
  try {
    const { docId, appointmentId } = req.body;

    const appointmentData = await appointmentModel.findById(appointmentId);
    if (appointmentData && appointmentData.docId === docId) {
      await appointmentModel.findByIdAndUpdate(appointmentId, {
        cancelled: true,
      });
      return res.json({ success: true, message: "Appointment Cancelled" });
    }

    res.json({ success: false, message: "Appointment Cancelled" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get dashboard data for doctor panel
const doctorDashboard = async (req, res) => {
  try {
    const { docId } = req.body;

    const appointments = await appointmentModel.find({ docId });

    let earnings = 0;

    appointments.map((item) => {
      if (item.isCompleted || item.payment) {
        earnings += item.amount;
      }
    });

    let patients = [];

    appointments.map((item) => {
      if (!patients.includes(item.userId)) {
        patients.push(item.userId);
      }
    });

    const dashData = {
      earnings,
      appointments: appointments.length,
      patients: patients.length,
      latestAppointments: appointments.reverse(),
    };

    res.json({ success: true, dashData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get doctor profile for  Doctor Panel
const doctorProfile = async (req, res) => {
  try {
    const { docId } = req.body;
    
    console.log('=== FETCHING DOCTOR PROFILE ===');
    console.log('docId:', docId);
    
    // Explicitly select all fields including phone
    const profileData = await doctorModel.findById(docId).select("-password").lean();

    console.log('Profile data phone field:', profileData?.phone);
    console.log('Profile data phone type:', typeof profileData?.phone);
    console.log('Full profile data keys:', Object.keys(profileData || {}));
    console.log('Full profile data:', JSON.stringify(profileData, null, 2));

    if (!profileData) {
      return res.json({ success: false, message: "Doctor not found" });
    }

    res.json({ success: true, profileData });
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    res.json({ success: false, message: error.message });
  }
};

// API to update doctor profile data from  Doctor Panel
const updateDoctorProfile = async (req, res) => {
  try {
    const { docId, fees, address, available, phone, about } = req.body;

    console.log('=== UPDATE PROFILE REQUEST ===');
    console.log('docId:', docId);
    console.log('Request body:', { fees, address, available, phone, about });
    console.log('Phone value:', phone, 'Type:', typeof phone);

    // First, get the current doctor to verify it exists
    const currentDoctor = await doctorModel.findById(docId);
    if (!currentDoctor) {
      return res.json({ success: false, message: "Doctor not found" });
    }

    console.log('Current doctor phone BEFORE update:', currentDoctor.phone);

    // Build update object - explicitly set each field
    const updateFields = {};
    
    if (fees !== undefined) {
      updateFields.fees = fees;
    }
    if (address !== undefined) {
      updateFields.address = address;
    }
    if (available !== undefined) {
      updateFields.available = available;
    }
    // CRITICAL: Always set phone if it's provided in the request
    // Check for both undefined and null, but allow empty string (frontend validates it's not empty)
    if (phone !== undefined && phone !== null) {
      const phoneValue = String(phone).trim();
      updateFields.phone = phoneValue;
      console.log('Setting phone to:', phoneValue, 'Length:', phoneValue.length);
    } else {
      console.log('WARNING: Phone is undefined or null in request!');
    }
    if (about !== undefined) {
      updateFields.about = about;
    }

    console.log('Update fields:', updateFields);

    // Use findByIdAndUpdate with $set to ensure proper update
    const updatedDoctor = await doctorModel.findByIdAndUpdate(
      docId,
      { $set: updateFields },
      { 
        new: true, 
        runValidators: true,
        upsert: false 
      }
    ).select("-password");

    if (!updatedDoctor) {
      return res.json({ success: false, message: "Failed to update doctor" });
    }

    console.log('Updated doctor phone AFTER update:', updatedDoctor.phone);
    console.log('Updated doctor object:', JSON.stringify(updatedDoctor.toObject(), null, 2));

    // Verify the phone was actually saved
    const verifyDoctor = await doctorModel.findById(docId).select("phone");
    console.log('Verification - phone in DB:', verifyDoctor?.phone);

    res.json({ 
      success: true, 
      message: "Profile Updated",
      profileData: updatedDoctor 
    });
  } catch (error) {
    console.error('ERROR updating doctor profile:', error);
    res.json({ success: false, message: error.message });
  }
};
export {
  changeAvailablity,
  doctorList,
  loginDoctor,
  appointmentsDoctor,
  appointmentComplete,
  appointmentCancel,
  doctorDashboard,
  doctorProfile,
  updateDoctorProfile,
};
