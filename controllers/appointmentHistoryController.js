import appointmentModel from '../models/appointmentModel.js';
import userModel from '../models/userModel.js';
import doctorModel from '../models/doctorModel.js';

/**
 * Get patient's appointment history with pagination and filtering
 * GET /api/user/appointments/history
 */
export const getAppointmentHistory = async (req, res) => {
  try {
    const { userId } = req.body; // From authUser middleware
    const { page = 1, pageSize = 20, filter = 'all' } = req.query;

    const pageNum = parseInt(page, 10);
    const pageSizeNum = parseInt(pageSize, 10);
    const skip = (pageNum - 1) * pageSizeNum;

    // Build query
    const query = { userId };

    // Apply filters
    if (filter === 'past') {
      // Past appointments: completed or cancelled, and date is in the past
      query.$or = [
        { status: 'COMPLETED' },
        { status: 'CANCELLED' },
        { isCompleted: true },
        { cancelled: true },
      ];
      // Also check if slotDate is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.$or.push({
        slotDate: { $lt: today.toISOString().split('T')[0] },
      });
    } else if (filter === 'cancelled') {
      query.$or = [
        { status: 'CANCELLED' },
        { cancelled: true },
      ];
    }
    // 'all' shows all appointments

    // Get total count
    const total = await appointmentModel.countDocuments(query);

    // Get appointments
    const appointments = await appointmentModel
      .find(query)
      .sort({ slotDate: -1, slotTime: -1, date: -1 }) // Most recent first
      .skip(skip)
      .limit(pageSizeNum)
      .lean();

    // Format response
    const items = appointments.map((apt) => {
      const doctorName = apt.docData?.name || 'Unknown Doctor';
      const specialization = apt.docData?.speciality || 'General Physician';
      const tokenNumber = apt.slotTokenIndex || apt.tokenNumber || 'N/A';
      
      // Determine status
      let status = 'completed';
      if (apt.cancelled || apt.status === 'CANCELLED') {
        status = 'cancelled';
      } else if (apt.isCompleted || apt.status === 'COMPLETED') {
        status = 'completed';
      } else if (apt.status === 'IN_PROGRESS') {
        status = 'in_progress';
      } else {
        status = 'booked';
      }

      // Format time
      const appointmentTime = apt.slotTime 
        ? `${apt.slotTime} ${apt.slotPeriod || ''}`.trim()
        : new Date(apt.date).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
          });

      // Format date
      const appointmentDate = apt.slotDate || new Date(apt.date).toISOString().split('T')[0];

      return {
        appointmentId: apt._id.toString(),
        doctorName,
        specialization,
        tokenNumber: `#${tokenNumber}`,
        time: new Date(apt.date || apt.slotDate).toISOString(),
        date: appointmentDate,
        timeFormatted: appointmentTime,
        status,
        notes: apt.notes || null,
        prescriptionUrl: apt.prescriptionUrl || null,
        invoiceUrl: apt.invoiceUrl || null,
        hospital: {
          name: apt.docData?.hospital || apt.docData?.address?.line1 || 'Hospital',
          phone: apt.docData?.phone || '',
          address: typeof apt.docData?.address === 'object'
            ? `${apt.docData.address.line1 || ''}, ${apt.docData.address.line2 || ''}, ${apt.docData.address.city || ''}, ${apt.docData.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',')
            : apt.docData?.address || 'Address not available',
        },
        doctorImage: apt.docData?.image || null,
        amount: apt.amount || 0,
        payment: apt.payment || false,
      };
    });

    res.json({
      success: true,
      items,
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      totalPages: Math.ceil(total / pageSizeNum),
    });
  } catch (error) {
    console.error('Error fetching appointment history:', error);
    res.json({
      success: false,
      message: error.message || 'Failed to fetch appointment history',
    });
  }
};

/**
 * Get single appointment details
 * GET /api/user/appointments/:appointmentId
 */
export const getAppointmentDetails = async (req, res) => {
  try {
    const { userId } = req.body; // From authUser middleware
    const { appointmentId } = req.params;

    const appointment = await appointmentModel.findById(appointmentId).lean();

    if (!appointment) {
      return res.json({
        success: false,
        message: 'Appointment not found',
      });
    }

    // Verify appointment belongs to user
    if (appointment.userId !== userId) {
      return res.json({
        success: false,
        message: 'Unauthorized access',
      });
    }

    // Format response
    const doctorName = appointment.docData?.name || 'Unknown Doctor';
    const specialization = appointment.docData?.speciality || 'General Physician';
    const tokenNumber = appointment.slotTokenIndex || appointment.tokenNumber || 'N/A';

    let status = 'completed';
    if (appointment.cancelled || appointment.status === 'CANCELLED') {
      status = 'cancelled';
    } else if (appointment.isCompleted || appointment.status === 'COMPLETED') {
      status = 'completed';
    } else if (appointment.status === 'IN_PROGRESS') {
      status = 'in_progress';
    } else {
      status = 'booked';
    }

    const appointmentTime = appointment.slotTime 
      ? `${appointment.slotTime} ${appointment.slotPeriod || ''}`.trim()
      : new Date(appointment.date).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });

    const appointmentDate = appointment.slotDate || new Date(appointment.date).toISOString().split('T')[0];

    res.json({
      success: true,
      appointment: {
        appointmentId: appointment._id.toString(),
        doctorName,
        specialization,
        tokenNumber: `#${tokenNumber}`,
        time: new Date(appointment.date || appointment.slotDate).toISOString(),
        date: appointmentDate,
        timeFormatted: appointmentTime,
        status,
        notes: appointment.notes || null,
        prescriptionUrl: appointment.prescriptionUrl || null,
        invoiceUrl: appointment.invoiceUrl || null,
        hospital: {
          name: appointment.docData?.hospital || appointment.docData?.address?.line1 || 'Hospital',
          phone: appointment.docData?.phone || '',
          address: typeof appointment.docData?.address === 'object'
            ? `${appointment.docData.address.line1 || ''}, ${appointment.docData.address.line2 || ''}, ${appointment.docData.address.city || ''}, ${appointment.docData.address.state || ''}`.replace(/^,\s*|,\s*$/g, '').replace(/,\s*,/g, ',')
            : appointment.docData?.address || 'Address not available',
        },
        doctorImage: appointment.docData?.image || null,
        amount: appointment.amount || 0,
        payment: appointment.payment || false,
        cancelled: appointment.cancelled || false,
        cancellationReason: appointment.cancellationReason || null,
        isCompleted: appointment.isCompleted || false,
        actualConsultDuration: appointment.actualConsultDuration || null,
        userData: appointment.userData || null,
        docData: appointment.docData || null,
      },
    });
  } catch (error) {
    console.error('Error fetching appointment details:', error);
    res.json({
      success: false,
      message: error.message || 'Failed to fetch appointment details',
    });
  }
};

