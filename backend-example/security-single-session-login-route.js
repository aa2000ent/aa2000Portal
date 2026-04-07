/**
 * Single-device login guard for Express `/security/login/verification`.
 *
 * Purpose:
 * - If an account already has `acc_sessionID`, block login from another device.
 * - Allow the SAME device to continue only when provided `s_name` matches the active session row.
 *
 * Expected tables/fields:
 * - Account: `acc_ID`, `acc_username`, `acc_password`, `acc_status`, `role_ID`, `acc_sessionID`
 * - Session: `s_ID`, `s_name`
 *
 * Mount example:
 *   const registerLoginVerification = require('./backend-example/security-single-session-login-route')
 *   registerLoginVerification(router, { Account, Session }, { verifyPassword })
 *
 * @param {import('express').Router} router
 * @param {{ Account: object, Session: object }} models
 * @param {{ verifyPassword: (plain: string, hashed: string) => Promise<boolean> | boolean }} deps
 */
function registerSingleSessionLoginVerification(router, { Account, Session }, { verifyPassword }) {
  router.post('/login/verification', async (req, res) => {
    try {
      const username = String(req.body?.username ?? '').trim()
      const password = String(req.body?.password ?? '')
      const providedSessionToken = String(req.body?.s_name ?? '').trim()

      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' })
      }

      const account = await Account.findOne({ where: { acc_username: username } })
      if (!account) {
        return res.status(401).json({ message: 'Invalid username or password.' })
      }

      const passwordOk = await verifyPassword(password, account.acc_password)
      if (!passwordOk) {
        return res.status(401).json({ message: 'Invalid username or password.' })
      }

      if (String(account.acc_status ?? '').toLowerCase() !== 'active') {
        return res.status(403).json({ message: 'Account is inactive.' })
      }

      let activeSession = null
      if (account.acc_sessionID) {
        activeSession = await Session.findOne({ where: { s_ID: account.acc_sessionID } })
      }

      // If DB pointer exists but row is gone, clear stale pointer.
      if (account.acc_sessionID && !activeSession) {
        await account.update({ acc_sessionID: null })
      }

      // Enforce one-device login:
      // - No session token from client => treated as another device/browser -> block.
      // - Token present but does not match active session => block.
      if (activeSession) {
        if (!providedSessionToken || providedSessionToken !== activeSession.s_name) {
          return res.status(409).json({
            message:
              'Account already has an active session on another device. Please logout from that device first.',
            code: 'ACTIVE_SESSION_EXISTS',
          })
        }
      }

      const crypto = require('crypto')
      const newSessionToken = crypto.randomBytes(32).toString('hex')
      const newSession = await Session.create({ s_name: newSessionToken })

      await account.update({ acc_sessionID: newSession.s_ID })

      return res.status(200).json({
        message: 'Login successful. Session created.',
        account: {
          acc_ID: account.acc_ID,
          username: account.acc_username,
          role_ID: account.role_ID,
          status: account.acc_status,
          acc_sessionID: newSession.s_ID,
        },
        session: {
          s_ID: newSession.s_ID,
          s_name: newSession.s_name,
          createdAt: newSession.createdAt,
        },
      })
    } catch (error) {
      console.error('Login verification error:', error)
      return res.status(500).json({ message: 'Internal server error.' })
    }
  })
}

module.exports = registerSingleSessionLoginVerification
