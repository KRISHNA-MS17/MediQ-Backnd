import axios from 'axios';

/**
 * Calculate ETA using Google Directions API (preferred)
 * Falls back to Haversine calculation if API unavailable
 */
export const getETA = async (req, res) => {
    try {
        const { fromLat, fromLng, toLat, toLng, mode = 'driving' } = req.query;

        console.log('ETA request received:', { fromLat, fromLng, toLat, toLng, mode });

        if (!fromLat || !fromLng || !toLat || !toLng) {
            return res.json({
                success: false,
                message: 'Missing required coordinates'
            });
        }

        // Try Google Directions API if key is available
        const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
        if (googleApiKey) {
            try {
                const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json`;
                const response = await axios.get(directionsUrl, {
                    params: {
                        origin: `${fromLat},${fromLng}`,
                        destination: `${toLat},${toLng}`,
                        mode: mode === 'walking' ? 'walking' : 'driving',
                        key: googleApiKey,
                    },
                    timeout: 5000,
                });

                if (response.data.status === 'OK' && response.data.routes.length > 0) {
                    const route = response.data.routes[0];
                    const leg = route.legs[0];
                    const durationMin = Math.round(leg.duration.value / 60); // Convert seconds to minutes
                    const distanceKm = (leg.distance.value / 1000).toFixed(1); // Convert meters to km

                    return res.json({
                        success: true,
                        durationMin,
                        distanceKm: parseFloat(distanceKm),
                        method: 'google_directions_api',
                    });
                }
            } catch (error) {
                console.error('Google Directions API error:', error.message);
                // Fall through to fallback
            }
        }

        // Fallback: Calculate using Haversine formula
        const distanceKm = calculateHaversineDistance(
            parseFloat(fromLat),
            parseFloat(fromLng),
            parseFloat(toLat),
            parseFloat(toLng)
        );

        const averageSpeeds = {
            driving: 40, // km/h
            walking: 5, // km/h
            'two-wheeler': 35, // km/h
        };

        const speed = averageSpeeds[mode] || averageSpeeds.driving;
        const timeHours = distanceKm / speed;
        const durationMin = Math.round(timeHours * 60);

        return res.json({
            success: true,
            durationMin,
            distanceKm: Math.round(distanceKm * 10) / 10,
            method: 'haversine_fallback',
        });
    } catch (error) {
        console.error('Error calculating ETA:', error);
        res.json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Calculate distance using Haversine formula
 */
const calculateHaversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

