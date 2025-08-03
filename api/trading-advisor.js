export default function handler(req, res) {
    return res.status(200).json({
        success: true,
        message: 'Trading advisor API is working',
        timestamp: new Date().toISOString()
    });
}