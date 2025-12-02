import appointmentModel from '../models/appointmentModel.js';
import razorpay from 'razorpay';

let razorpayInstance = null;

// Initialize Razorpay
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

/**
 * Create Razorpay order and return checkout page HTML
 */
export const getRazorpayCheckoutPage = async (req, res) => {
    try {
        console.log('Payment checkout page requested:', req.query);
        
        const { appointmentId, orderId } = req.query;
        const { userId } = req.body; // From authUser middleware

        if (!appointmentId) {
            console.error('Missing appointmentId in query');
            return res.status(400).send(`
                <html>
                    <body>
                        <h1>Error</h1>
                        <p>Appointment ID is required</p>
                    </body>
                </html>
            `);
        }

        if (!razorpayInstance) {
            console.error('Razorpay instance not initialized');
            return res.status(500).send(`
                <html>
                    <body>
                        <h1>Error</h1>
                        <p>Payment service is not configured. Please contact support.</p>
                    </body>
                </html>
            `);
        }

        // Get appointment
        const appointment = await appointmentModel.findById(appointmentId);
        if (!appointment) {
            console.error('Appointment not found:', appointmentId);
            return res.status(404).send(`
                <html>
                    <body>
                        <h1>Error</h1>
                        <p>Appointment not found</p>
                    </body>
                </html>
            `);
        }

        if (appointment.userId !== userId) {
            console.error('User ID mismatch:', { appointmentUserId: appointment.userId, requestUserId: userId });
            return res.status(403).send(`
                <html>
                    <body>
                        <h1>Error</h1>
                        <p>Unauthorized access</p>
                    </body>
                </html>
            `);
        }

        // Get or create order
        let order;
        try {
            if (orderId) {
                // Fetch existing order
                console.log('Fetching existing order:', orderId);
                order = await razorpayInstance.orders.fetch(orderId);
            } else {
                // Create new order
                console.log('Creating new Razorpay order for appointment:', appointmentId);
                const options = {
                    amount: appointment.amount * 100, // Convert to paise
                    currency: process.env.CURRENCY || 'INR',
                    receipt: appointmentId,
                };
                order = await razorpayInstance.orders.create(options);
                console.log('Razorpay order created:', order.id);
            }
        } catch (razorpayError) {
            console.error('Razorpay API error:', razorpayError);
            return res.status(500).send(`
                <html>
                    <body>
                        <h1>Payment Error</h1>
                        <p>Failed to create payment order. Please try again.</p>
                        <p>Error: ${razorpayError.message}</p>
                    </body>
                </html>
            `);
        }

        const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
        // Get API base from request origin or environment
        const protocol = req.protocol || 'https';
        const host = req.get('host') || process.env.API_BASE || 'mediq-backnd.onrender.com';
        const apiBase = `${protocol}://${host}`;

        // Generate checkout page HTML
        const checkoutHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Complete Payment - MediQ</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .header {
            text-align: center;
            margin-bottom: 32px;
        }
        .header h1 {
            color: #1f2937;
            font-size: 24px;
            margin-bottom: 8px;
        }
        .header p {
            color: #6b7280;
            font-size: 14px;
        }
        .payment-info {
            background: #f9fafb;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        .info-row:last-child {
            margin-bottom: 0;
        }
        .info-label {
            color: #6b7280;
            font-size: 14px;
        }
        .info-value {
            color: #1f2937;
            font-size: 14px;
            font-weight: 600;
        }
        .amount {
            font-size: 28px;
            font-weight: 700;
            color: #3b82f6;
        }
        .pay-button {
            width: 100%;
            background: #3b82f6;
            color: white;
            border: none;
            padding: 16px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }
        .pay-button:hover {
            background: #2563eb;
        }
        .pay-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #6b7280;
        }
        .error {
            background: #fee2e2;
            color: #991b1b;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 14px;
        }
        .success {
            background: #d1fae5;
            color: #065f46;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 16px;
            font-size: 14px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Complete Payment</h1>
            <p>MediQ Appointment Payment</p>
        </div>
        
        <div id="error-container"></div>
        <div id="success-container"></div>
        
        <div class="payment-info">
            <div class="info-row">
                <span class="info-label">Appointment ID:</span>
                <span class="info-value">${appointmentId.substring(0, 8)}...</span>
            </div>
            <div class="info-row">
                <span class="info-label">Order ID:</span>
                <span class="info-value">${order.id}</span>
            </div>
            <div class="info-row" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                <span class="info-label">Amount:</span>
                <span class="info-value amount">₹${(order.amount / 100).toFixed(2)}</span>
            </div>
        </div>
        
        <button id="pay-button" class="pay-button" onclick="initiatePayment()">
            Pay ₹${(order.amount / 100).toFixed(2)}
        </button>
        
        <div id="loading" class="loading" style="display: none;">
            Processing payment...
        </div>
    </div>

    <script>
        const razorpayKeyId = '${razorpayKeyId}';
        const orderId = '${order.id}';
        const amount = ${order.amount};
        const currency = '${order.currency}';
        const appointmentId = '${appointmentId}';
        const apiBase = '${apiBase}';
        const token = new URLSearchParams(window.location.search).get('token') || '';

        function showError(message) {
            const container = document.getElementById('error-container');
            container.innerHTML = '<div class="error">' + message + '</div>';
        }

        function showSuccess(message) {
            const container = document.getElementById('success-container');
            container.innerHTML = '<div class="success">' + message + '</div>';
        }

        function setLoading(loading) {
            document.getElementById('pay-button').disabled = loading;
            document.getElementById('loading').style.display = loading ? 'block' : 'none';
        }

        async function initiatePayment() {
            try {
                setLoading(true);
                showError('');

                const options = {
                    key: razorpayKeyId,
                    amount: amount,
                    currency: currency,
                    name: 'MediQ Appointment',
                    description: 'Appointment Payment',
                    order_id: orderId,
                    receipt: appointmentId,
                    handler: async function(response) {
                        try {
                            setLoading(true);
                            
                            // Verify payment with backend
                            const verifyResponse = await fetch(apiBase + '/api/user/verifyRazorpay', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'token': token
                                },
                                body: JSON.stringify({
                                    ...response,
                                    appointmentId: appointmentId
                                })
                            });

                            const verifyData = await verifyResponse.json();

                            if (verifyData.success) {
                                showSuccess('Payment successful! You can close this window.');
                                setLoading(false);
                                
                                // Try to close window or redirect
                                setTimeout(() => {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'payment_success',
                                            data: response
                                        }));
                                    } else {
                                        // For mobile browser, try to close or show message
                                        window.location.href = 'mediq://payment-success?appointmentId=' + appointmentId;
                                    }
                                }, 2000);
                            } else {
                                throw new Error(verifyData.message || 'Payment verification failed');
                            }
                        } catch (error) {
                            console.error('Verification error:', error);
                            showError('Payment verification failed: ' + error.message);
                            setLoading(false);
                        }
                    },
                    prefill: {
                        contact: '',
                        email: ''
                    },
                    theme: {
                        color: '#3b82f6'
                    },
                    modal: {
                        ondismiss: function() {
                            setLoading(false);
                            showError('Payment was cancelled');
                        }
                    }
                };

                const rzp = new Razorpay(options);
                
                rzp.on('payment.failed', function(response) {
                    setLoading(false);
                    showError('Payment failed: ' + (response.error.description || 'Unknown error'));
                });

                rzp.open();
                setLoading(false);
            } catch (error) {
                console.error('Payment error:', error);
                showError('Failed to initialize payment: ' + error.message);
                setLoading(false);
            }
        }

        // Auto-initiate payment on page load (optional)
        // Uncomment the line below if you want payment to start automatically
        // window.addEventListener('load', () => initiatePayment());
    </script>
</body>
</html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.send(checkoutHTML);
    } catch (error) {
        console.error('Error generating checkout page:', error);
        res.status(500).send(`
            <html>
                <body>
                    <h1>Error</h1>
                    <p>${error.message}</p>
                </body>
            </html>
        `);
    }
};

