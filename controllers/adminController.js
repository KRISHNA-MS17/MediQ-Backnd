import validator from 'validator'
import bcrypt from 'bcrypt'
import { v2 as cloudinary } from 'cloudinary'
import doctorModel from '../models/doctorModel.js'
import jwt from 'jsonwebtoken'
import appointmentModel from '../models/appointmentModel.js'
import userModel from '../models/userModel.js'

// API for adding doctor
const addDoctor = async (req, res) => {

    try {

        const { name, email, password, speciality, degree, experience, about, fees, address, latitude, longitude } = req.body
        const imageFile = req.file

        // checking for all data to add doctor
        if (!name || !email || !password || !speciality || !degree || !experience || !about || !fees || !address) {
            return res.json({ success: false, message: "Missing Details" })
        }

        // validating email format
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }

        // validating strong password
        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        // Check if Cloudinary is configured
        const cloudName = (process.env.CLOUDINARY_NAME || '').replace(/^["']|["']$/g, '').trim()
        const apiKey = (process.env.CLOUDINARY_API_KEY || '').replace(/^["']|["']$/g, '').trim()
        const apiSecret = (process.env.CLOUDINARY_SECRET_KEY || '').replace(/^["']|["']$/g, '').trim()

        if (!cloudName || !apiKey || !apiSecret || cloudName === 'YOUR_CLOUDINARY_NAME' || cloudName.includes('YOUR_CLOUDINARY')) {
            return res.json({ 
                success: false, 
                message: "Cloudinary not configured. Please set CLOUDINARY_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY in .env file. Get credentials from https://cloudinary.com/console" 
            })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)// the more no. round the more time it will take
        const hashedPassword = await bcrypt.hash(password, salt)

        // Check if image file is provided
        if (!imageFile) {
            return res.json({ 
                success: false, 
                message: "Doctor image is required. Please upload an image." 
            })
        }

        // Configure Cloudinary before upload (using variables already declared above)
        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret
        })

        // upload image to cloudinary
        let imageUrl;
        try {
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" })
            imageUrl = imageUpload.secure_url
        } catch (cloudinaryError) {
            console.error("Cloudinary upload error:", cloudinaryError)
            return res.json({ 
                success: false, 
                message: `Image upload failed: ${cloudinaryError.message || "Invalid Cloudinary configuration. Please check your CLOUDINARY_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_SECRET_KEY in .env file."}` 
            })
        }

        const doctorData = {
            name,
            email,
            image: imageUrl,
            password: hashedPassword,
            speciality,
            degree,
            experience,
            about,
            fees,
            address: JSON.parse(address),
            date: Date.now()
        }

        // Add location data if latitude and longitude are provided
        if (latitude && longitude) {
            const parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
            doctorData.location = {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                address: typeof parsedAddress === 'object' 
                    ? `${parsedAddress.line1 || ''} ${parsedAddress.line2 || ''}`.trim()
                    : parsedAddress
            }
        }

        const newDoctor = new doctorModel(doctorData)
        await newDoctor.save()
        res.json({ success: true, message: 'Doctor Added' })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API for admin login
const loginAdmin = async (req, res) => {
    try {

        const { email, password } = req.body

        // Use default admin credentials if environment variables are not set
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com'
        const adminPassword = process.env.ADMIN_PASSWORD || 'docplus123'

        if (email === adminEmail && password === adminPassword) {
            const token = jwt.sign(email + password, process.env.JWT_SECRET || 'doctalk')
            res.json({ success: true, token })
            
        } else {
            res.json({ success: false, message: "Invalid credentials" })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }

}

// API to get all doctors list for admin panel
const allDoctors = async (req, res) => {
    try {

        const doctors = await doctorModel.find({}).select('-password')
        res.json({ success: true, doctors })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to get all appointments list
const appointmentsAdmin = async (req, res) => {

    try {

        const appointments = await appointmentModel.find({})
        res.json({ success: true, appointments })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }

}

// API for appointment cancellation
const appointmentCancel = async (req, res) => {
    try {

        const { appointmentId } = req.body
        await appointmentModel.findByIdAndUpdate(appointmentId, { cancelled: true })

        res.json({ success: true, message: 'Appointment Cancelled' })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }

}

// API to get dashboard data for admin panel
const adminDashboard = async (req, res) => {
    try {

        const doctors = await doctorModel.find({})
        const users = await userModel.find({})
        const appointments = await appointmentModel.find({})

        const dashData = {
            doctors: doctors.length,
            appointments: appointments.length,
            patients: users.length,
            latestAppointments: appointments.reverse().slice(0,5)
        }

        res.json({ success: true, dashData })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// API to delete doctor
const deleteDoctor = async (req, res) => {
    try {
        console.log('Delete doctor request received:', req.body)
        const { docId } = req.body

        if (!docId) {
            return res.json({ success: false, message: "Doctor ID is required" })
        }

        // Check if doctor exists
        const doctor = await doctorModel.findById(docId)
        if (!doctor) {
            return res.json({ success: false, message: "Doctor not found" })
        }

        // Check if doctor has any appointments
        const appointments = await appointmentModel.find({ docId })
        if (appointments.length > 0) {
            return res.json({ 
                success: false, 
                message: "Cannot delete doctor with existing appointments. Please cancel all appointments first." 
            })
        }

        await doctorModel.findByIdAndDelete(docId)
        console.log('Doctor deleted successfully:', docId)
        res.json({ success: true, message: 'Doctor deleted successfully' })

    } catch (error) {
        console.error('Delete doctor error:', error)
        res.json({ success: false, message: error.message })
    }
}

// API to update doctor
const updateDoctor = async (req, res) => {
    try {
        console.log('Update doctor request received')
        console.log('Body:', req.body)
        console.log('File:', req.file ? 'Present' : 'Not provided')
        
        const { docId, name, email, password, speciality, degree, experience, about, fees, address, latitude, longitude } = req.body
        const imageFile = req.file

        if (!docId) {
            return res.json({ success: false, message: "Doctor ID is required" })
        }

        // Check if doctor exists
        const doctor = await doctorModel.findById(docId)
        if (!doctor) {
            return res.json({ success: false, message: "Doctor not found" })
        }

        const updateData = {}

        if (name) updateData.name = name
        if (email) {
            if (!validator.isEmail(email)) {
                return res.json({ success: false, message: "Please enter a valid email" })
            }
            updateData.email = email
        }
        if (password) {
            if (password.length < 8) {
                return res.json({ success: false, message: "Password must be at least 8 characters long" })
            }
            const salt = await bcrypt.genSalt(10)
            updateData.password = await bcrypt.hash(password, salt)
        }
        if (speciality) updateData.speciality = speciality
        if (degree) updateData.degree = degree
        if (experience) updateData.experience = experience
        if (about) updateData.about = about
        if (fees) updateData.fees = Number(fees)
        if (address) updateData.address = typeof address === 'string' ? JSON.parse(address) : address

        // Handle image upload if provided
        if (imageFile) {
            const cloudName = (process.env.CLOUDINARY_NAME || '').replace(/^["']|["']$/g, '').trim()
            const apiKey = (process.env.CLOUDINARY_API_KEY || '').replace(/^["']|["']$/g, '').trim()
            const apiSecret = (process.env.CLOUDINARY_SECRET_KEY || '').replace(/^["']|["']$/g, '').trim()

            if (cloudName && apiKey && apiSecret && cloudName !== 'YOUR_CLOUDINARY_NAME') {
                cloudinary.config({
                    cloud_name: cloudName,
                    api_key: apiKey,
                    api_secret: apiSecret
                })

                try {
                    const imageUpload = await cloudinary.uploader.upload(imageFile.path, { resource_type: "image" })
                    updateData.image = imageUpload.secure_url
                } catch (cloudinaryError) {
                    console.error("Cloudinary upload error:", cloudinaryError)
                    return res.json({ 
                        success: false, 
                        message: `Image upload failed: ${cloudinaryError.message}` 
                    })
                }
            }
        }

        // Handle location data if latitude and longitude are provided
        if (latitude && longitude) {
            const parsedAddress = typeof address === 'string' ? JSON.parse(address) : address;
            updateData.location = {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                address: typeof parsedAddress === 'object' 
                    ? `${parsedAddress.line1 || ''} ${parsedAddress.line2 || ''}`.trim()
                    : parsedAddress
            }
        } else if (latitude !== undefined && longitude !== undefined && !latitude && !longitude) {
            // Clear location if both are empty
            updateData.location = {
                latitude: null,
                longitude: null,
                address: ''
            }
        }

        await doctorModel.findByIdAndUpdate(docId, updateData)
        console.log('Doctor updated successfully:', docId)
        res.json({ success: true, message: 'Doctor updated successfully' })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export {addDoctor, loginAdmin, allDoctors, appointmentsAdmin, appointmentCancel, adminDashboard, deleteDoctor, updateDoctor}