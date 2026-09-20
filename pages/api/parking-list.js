/**
 * GET /api/parking-list?dateFrom&dateTo&status&company&search
 *   Returns the filtered parking bookings list for the dashboard's Parking
 *   tab (Today & upcoming / History views, plus filters and search).
 *
 * GET /api/parking-list?id=123
 *   Returns one booking plus its full change history, for the booking
 *   detail view's "who asked for this, for which project, when" timeline.
 */
import { getParkingBookings, getParkingBookingById, getParkingHistory } from '../../lib/db';
import { requireSession } from '../../lib/session';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { id, dateFrom, dateTo, status, company, search } = req.query;

  try {
    if (id) {
      const booking = await getParkingBookingById(Number(id));
      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }
      const history = await getParkingHistory(booking.id);
      return res.status(200).json({ success: true, booking, history });
    }

    const records = await getParkingBookings({ dateFrom, dateTo, status, company, search });
    return res.status(200).json({ success: true, records });
  } catch (err) {
    console.error('Parking list error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
}

export default requireSession(handler);
