/**
 * Idagdag sa Express security router (pareho sa `/login/verification`).
 *
 * Rehistro ng **dalawang** URL (parehong logic):
 *   POST /security/logout
 *   POST /security/login/logout
 *
 * Gamitin:
 *   const registerLogout = require('./backend-example/security-logout-route')
 *   registerLogout(router, { Account, Session })
 *
 * Mount: `app.use('/security', securityRouter)`
 *
 * @param {import('express').Router} router
 * @param {{ Account: object, Session: object }} models
 */
function registerSecurityLogout(router, { Account, Session }) {
  const handler = async (req, res) => {
    try {
      const { username } = req.body

      const account = await Account.findOne({ where: { acc_username: username } })

      if (!account) {
        return res.status(404).json({ message: 'Account not found.' })
      }

      if (!account.acc_sessionID) {
        return res.status(400).json({ message: 'No active session to terminate.' })
      }

      const session = await Session.findOne({ where: { s_ID: account.acc_sessionID } })

      if (session) {
        await session.destroy()
      }

      await account.update({ acc_sessionID: null })

      res.status(200).json({ message: 'Logout successful. Session terminated.' })
    } catch (error) {
      console.error('Logout error:', error)
      res.status(500).json({ message: 'Internal server error during logout.' })
    }
  }

  router.post('/logout', handler)
  router.post('/login/logout', handler)
}

module.exports = registerSecurityLogout
