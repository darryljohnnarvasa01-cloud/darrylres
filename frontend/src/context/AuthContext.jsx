/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearApiCache } from '../lib/api'
import { clearAuthState, getAuthState, saveAuthState } from '../lib/authStorage'
import { disconnectEcho, initializeEcho } from '../lib/echo'
import { guestHeaders } from '../lib/guestReporting'
import { getDefaultRouteForUser, hasPermission, permissionListForUser } from '../lib/permissions'

const AuthContext = createContext(null)
const EMPTY_AUTH_STATE = { user: null, token: null, role: null }

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(getAuthState)
  const [isHydrating, setIsHydrating] = useState(Boolean(getAuthState().token))

  const applyAuthState = useCallback(({ user, token, role }) => {
    const nextState = { user, token, role }
    setAuthState(nextState)
    saveAuthState(nextState)
  }, [])

  const clearSession = useCallback(() => {
    setAuthState(EMPTY_AUTH_STATE)
    setIsHydrating(false)
    clearAuthState()
    clearApiCache()
    disconnectEcho()
  }, [])

  const login = useCallback(async ({ user, token, role }) => {
    applyAuthState({ user, token, role })
    clearApiCache()

    if (role !== 'citizen') {
      return { claimedCount: 0 }
    }

    try {
      const response = await api.post('/api/v1/incidents/guest/claim', {}, {
        headers: guestHeaders(),
      })

      return {
        claimedCount: Number(response.data?.data?.claimed_count ?? 0),
      }
    } catch {
      return { claimedCount: 0 }
    } finally {
      clearApiCache()
    }
  }, [applyAuthState])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // Ignore remote logout failures and clear local auth anyway.
    } finally {
      clearSession()
    }
  }, [clearSession])

  useEffect(() => {
    if (authState.token) {
      initializeEcho(authState.token)
    } else {
      disconnectEcho()
    }
  }, [authState.token])

  useEffect(() => {
    if (!authState.token) {
      setIsHydrating(false)
      return undefined
    }

    let active = true
    setIsHydrating(true)

    const hydrateUser = async () => {
      try {
        const response = await api.get('/api/v1/auth/me')
        const payload = response.data?.data
        const role = payload?.role ?? payload?.user?.role
        const user = payload?.user

        if (!active) {
          return
        }

        setAuthState((current) => {
          const nextState = {
            ...current,
            role: role ?? current.role,
            user: user ?? current.user,
          }

          saveAuthState(nextState)
          return nextState
        })
      } catch (error) {
        const status = error?.response?.status

        if (active && (status === 401 || status === 403)) {
          clearSession()
        }
      } finally {
        if (active) {
          setIsHydrating(false)
        }
      }
    }

    hydrateUser()

    return () => {
      active = false
    }
  }, [authState.token, clearSession])

  const permissions = useMemo(
    () => permissionListForUser(authState.user, authState.role),
    [authState.role, authState.user],
  )
  const can = useCallback(
    (ability) => hasPermission(authState.user, ability, authState.role),
    [authState.role, authState.user],
  )
  const defaultRoute = useMemo(
    () => getDefaultRouteForUser(authState.user, authState.role),
    [authState.role, authState.user],
  )

  const value = useMemo(
    () => ({
      ...authState,
      isAuthenticated: Boolean(authState.token),
      isHydrating,
      permissions,
      can,
      defaultRoute,
      login,
      logout,
    }),
    [authState, can, defaultRoute, isHydrating, login, logout, permissions],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
